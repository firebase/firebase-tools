import { bold, underline } from "colorette";
import * as fs from "fs";
import * as yaml from "js-yaml";
import { safeLoad } from "js-yaml";
import * as ora from "ora";
import * as path from "path";
import * as libsodium from "libsodium-wrappers";

import { Setup } from "../..";
import { loginGithub } from "../../../auth";
import { dirExistsSync } from "../../../fsutils";
import {
  createServiceAccount,
  createServiceAccountKey,
  deleteServiceAccount,
  listServiceAccountKeys,
} from "../../../gcp/iam";
import { addServiceAccountToRoles, firebaseRoles } from "../../../gcp/resourceManager";
import { logger } from "../../../logger";
import { prompt } from "../../../prompt";
import { logBullet, logLabeledBullet, logSuccess, logWarning, reject } from "../../../utils";
import { githubApiOrigin, githubClientId } from "../../../api";
import { Client } from "../../../apiv2";
import { FirebaseError } from "../../../error";

let GIT_DIR: string;
let GITHUB_DIR: string;
let WORKFLOW_DIR: string;
let YML_FULL_PATH_PULL_REQUEST: string;
let YML_FULL_PATH_MERGE: string;

const YML_PULL_REQUEST_FILENAME = "firebase-hosting-pull-request.yml";
const YML_MERGE_FILENAME = "firebase-hosting-merge.yml";

const CHECKOUT_GITHUB_ACTION_NAME = "actions/checkout@v4";
const HOSTING_GITHUB_ACTION_NAME = "FirebaseExtended/action-hosting-deploy@v0";

const SERVICE_ACCOUNT_MAX_KEY_NUMBER = 10;

const githubApiClient = new Client({ urlPrefix: githubApiOrigin, auth: false });

/**
 * Assists in setting up a GitHub workflow by doing the following:
 * - Creates a GCP service account with permission to deploy to Hosting
 * - Encrypts that service account's JSON key and uploads it to the specified GitHub repository as a Secret
 *     - https://docs.github.com/en/actions/configuring-and-managing-workflows/creating-and-storing-encrypted-secrets
 * - Writes GitHub workflow yaml configuration files that reference the newly created secret
 *   to configure the Deploy to Firebase Hosting GitHub Action
 *     - https://github.com/marketplace/actions/deploy-to-firebase-hosting
 *     - https://docs.github.com/en/actions/reference/workflow-syntax-for-github-actions
 *
 * @param setup A helper object provided by the `firebase init` command.
 * @param config Configuration for the project.
 * @param options Command line options.
 */
export async function initGitHub(setup: Setup): Promise<void> {
  if (!setup.projectId) {
    return reject("Could not determine Project ID, can't set up GitHub workflow.", { exit: 1 });
  }

  if (!setup.config.hosting) {
    return reject(
      `Didn't find a Hosting config in firebase.json. Run ${bold("firebase init hosting")} instead.`,
    );
  }

  logger.info();

  // Find existing Git/Github config
  const gitRoot = getGitFolderPath();
  GIT_DIR = path.join(gitRoot, ".git");
  GITHUB_DIR = path.join(gitRoot, ".github");
  WORKFLOW_DIR = `${GITHUB_DIR}/workflows`;
  YML_FULL_PATH_PULL_REQUEST = `${WORKFLOW_DIR}/${YML_PULL_REQUEST_FILENAME}`;
  YML_FULL_PATH_MERGE = `${WORKFLOW_DIR}/${YML_MERGE_FILENAME}`;

  // GitHub Oauth
  logBullet(
    "Authorizing with GitHub to upload your service account to a GitHub repository's secrets store.",
  );

  const ghAccessToken = await signInWithGitHub();

  // Get GitHub user Details
  const userDetails = await getGitHubUserDetails(ghAccessToken);
  const ghUserName = userDetails.login;

  logger.info();
  logSuccess(`Success! Logged into GitHub as ${bold(ghUserName)}`);
  logger.info();

  // Prompt for repo and validate by getting the public key
  const { repo, key, keyId } = await promptForRepo(setup, ghAccessToken);

  const { default_branch: defaultBranch, id: repoId } = await getRepoDetails(repo, ghAccessToken);

  // Valid secret names:
  // https://docs.github.com/en/actions/configuring-and-managing-workflows/creating-and-storing-encrypted-secrets#naming-your-secrets
  const githubSecretName = `FIREBASE_SERVICE_ACCOUNT_${setup.projectId
    .replace(/-/g, "_")
    .toUpperCase()}`;

  const serviceAccountName = `github-action-${repoId}`;

  const serviceAccountJSON = await createServiceAccountAndKeyWithRetry(
    setup,
    repo,
    serviceAccountName,
  );

  logger.info();
  logSuccess(
    `Created service account ${bold(serviceAccountName)} with Firebase Hosting admin permissions.`,
  );

  const spinnerSecrets = ora(`Uploading service account secrets to repository: ${repo}`);
  spinnerSecrets.start();

  const encryptedServiceAccountJSON = encryptServiceAccountJSON(serviceAccountJSON, key);

  await uploadSecretToGitHub(
    repo,
    ghAccessToken,
    await encryptedServiceAccountJSON,
    keyId,
    githubSecretName,
  );
  spinnerSecrets.stop();

  logSuccess(`Uploaded service account JSON to GitHub as secret ${bold(githubSecretName)}.`);
  logBullet(`You can manage your secrets at https://github.com/${repo}/settings/secrets.`);
  logger.info();

  // If the developer is using predeploy scripts in firebase.json,
  // remind them before they set up a script in their workflow file.
  if (setup.config.hosting.predeploy) {
    logBullet(`You have a predeploy script configured in firebase.json.`);
  }

  const { script } = await promptForBuildScript();

  const ymlDeployDoc = loadYMLDeploy();

  let shouldWriteYMLHostingFile = true;
  let shouldWriteYMLDeployFile = false;

  // If the preview YML file exists, ask the user to overwrite. This file is generated by
  // the CLI and rarely touched by the user.
  if (fs.existsSync(YML_FULL_PATH_PULL_REQUEST)) {
    const { overwrite } = await promptForWriteYMLFile({
      message: `GitHub workflow file for PR previews exists. Overwrite? ${YML_PULL_REQUEST_FILENAME}`,
    });
    shouldWriteYMLHostingFile = overwrite;
  }

  if (shouldWriteYMLHostingFile) {
    writeChannelActionYMLFile(
      YML_FULL_PATH_PULL_REQUEST,
      githubSecretName,
      setup.projectId,
      script,
    );

    logger.info();
    logSuccess(`Created workflow file ${bold(YML_FULL_PATH_PULL_REQUEST)}`);
  }

  const { setupDeploys, branch } = await promptToSetupDeploys(ymlDeployDoc.branch || defaultBranch);

  // If the user has an existing YML file for deploys to production, we need to
  // check the branch used in the file against the branch supplied by the user
  // in the prompt. If those values are different, we will overwrite the YML
  // file without consent from the user because the deploy will break if they
  // keep the old file. If the values are the same, we will prompt for consent.
  if (setupDeploys) {
    if (ymlDeployDoc.exists) {
      if (ymlDeployDoc.branch !== branch) {
        shouldWriteYMLDeployFile = true;
      } else {
        const { overwrite } = await promptForWriteYMLFile({
          message: `The GitHub workflow file for deploying to the live channel already exists. Overwrite? ${YML_MERGE_FILENAME}`,
        });
        shouldWriteYMLDeployFile = overwrite;
      }
    } else {
      shouldWriteYMLDeployFile = true;
    }

    if (shouldWriteYMLDeployFile) {
      writeDeployToProdActionYMLFile(
        YML_FULL_PATH_MERGE,
        branch,
        githubSecretName,
        setup.projectId,
        script,
      );

      logger.info();
      logSuccess(`Created workflow file ${bold(YML_FULL_PATH_MERGE)}`);
    }
  }

  logger.info();
  logLabeledBullet(
    "Action required",
    `Visit this URL to revoke authorization for the Firebase CLI GitHub OAuth App:`,
  );
  logger.info(
    bold(underline(`https://github.com/settings/connections/applications/${githubClientId}`)),
  );
  logLabeledBullet("Action required", `Push any new workflow file(s) to your repo`);
}

/**
 * Finds the folder that contains the .git folder
 *
 * For example, if the .git folder is /Users/sparky/projects/my-web-app/.git
 * This function will return /Users/sparky/projects/my-web-app
 *
 * Modeled after https://github.com/firebase/firebase-tools/blob/master/src/detectProjectRoot.ts
 *
 * @return {string} The folder that contains the .git folder
 */
function getGitFolderPath(): string {
  const commandDir = process.cwd();
  let projectRootDir = commandDir;

  while (!fs.existsSync(path.resolve(projectRootDir, ".git"))) {
    const parentDir = path.dirname(projectRootDir);

    // Stop searching if we get to the root of the filesystem
    if (parentDir === projectRootDir) {
      logBullet(`Didn't detect a .git folder. Assuming ${commandDir} is the project root.`);
      return commandDir;
    }
    projectRootDir = parentDir;
  }

  logBullet(`Detected a .git folder at ${projectRootDir}`);
  return projectRootDir;
}

function defaultGithubRepo(): string | undefined {
  const gitConfigPath = path.join(GIT_DIR, "config");

  if (fs.existsSync(gitConfigPath)) {
    const gitConfig = fs.readFileSync(gitConfigPath, "utf8");
    const match = /github\.com:(.+)\.git/.exec(gitConfig);
    if (match) {
      return match[1];
    }
  }
  return undefined;
}

function loadYMLDeploy(): { exists: boolean; branch?: string } {
  if (fs.existsSync(YML_FULL_PATH_MERGE)) {
    const { on } = loadYML(YML_FULL_PATH_MERGE);
    const branch = on.push.branches[0];
    return { exists: true, branch };
  } else {
    return { exists: false };
  }
}

function loadYML(ymlPath: string) {
  return safeLoad(fs.readFileSync(ymlPath, "utf8"));
}

function mkdirNotExists(dir: string): void {
  if (!dirExistsSync(dir)) {
    fs.mkdirSync(dir);
  }
}

// https://docs.github.com/en/actions/reference/workflow-syntax-for-github-actions
type GitHubWorkflowConfig = {
  name: string;
  on: string | { [key: string]: { [key: string]: string[] } };
  jobs: {
    [key: string]: {
      if?: string;
      "runs-on": string;
      steps: {
        uses?: string;
        run?: string;
        with?: { [key: string]: string };
        env?: { [key: string]: string };
      }[];
    };
  };
};

function writeChannelActionYMLFile(
  ymlPath: string,
  secretName: string,
  projectId: string,
  script?: string,
): void {
  const workflowConfig: GitHubWorkflowConfig = {
    name: "Deploy to Firebase Hosting on PR",
    on: "pull_request",
    jobs: {
      ["build_and_preview"]: {
        if: "${{ github.event.pull_request.head.repo.full_name == github.repository }}", // secrets aren't accessible on PRs from forks
        "runs-on": "ubuntu-latest",
        steps: [{ uses: CHECKOUT_GITHUB_ACTION_NAME }],
      },
    },
  };

  if (script) {
    workflowConfig.jobs.build_and_preview.steps.push({
      run: script,
    });
  }

  workflowConfig.jobs.build_and_preview.steps.push({
    uses: HOSTING_GITHUB_ACTION_NAME,
    with: {
      repoToken: "${{ secrets.GITHUB_TOKEN }}",
      firebaseServiceAccount: `\${{ secrets.${secretName} }}`,
      projectId: projectId,
    },
  });

  const ymlContents = `# This file was auto-generated by the Firebase CLI
# https://github.com/firebase/firebase-tools

${yaml.safeDump(workflowConfig)}`;

  mkdirNotExists(GITHUB_DIR);
  mkdirNotExists(WORKFLOW_DIR);
  fs.writeFileSync(ymlPath, ymlContents, "utf8");
}

function writeDeployToProdActionYMLFile(
  ymlPath: string,
  branch: string | undefined,
  secretName: string,
  projectId: string,
  script?: string,
): void {
  const workflowConfig: GitHubWorkflowConfig = {
    name: "Deploy to Firebase Hosting on merge",
    on: { push: { branches: [branch || "master"] } },
    jobs: {
      ["build_and_deploy"]: {
        "runs-on": "ubuntu-latest",
        steps: [{ uses: CHECKOUT_GITHUB_ACTION_NAME }],
      },
    },
  };

  if (script) {
    workflowConfig.jobs.build_and_deploy.steps.push({
      run: script,
    });
  }

  workflowConfig.jobs.build_and_deploy.steps.push({
    uses: HOSTING_GITHUB_ACTION_NAME,
    with: {
      repoToken: "${{ secrets.GITHUB_TOKEN }}",
      firebaseServiceAccount: `\${{ secrets.${secretName} }}`,
      channelId: "live",
      projectId: projectId,
    },
  });

  const ymlContents = `# This file was auto-generated by the Firebase CLI
# https://github.com/firebase/firebase-tools

${yaml.safeDump(workflowConfig)}`;

  mkdirNotExists(GITHUB_DIR);
  mkdirNotExists(WORKFLOW_DIR);
  fs.writeFileSync(ymlPath, ymlContents, "utf8");
}

async function uploadSecretToGitHub(
  repo: string,
  ghAccessToken: string,
  encryptedServiceAccountJSON: string,
  keyId: string,
  secretName: string,
): Promise<{ status: any }> {
  const data = {
    ["encrypted_value"]: encryptedServiceAccountJSON,
    ["key_id"]: keyId,
  };
  const headers = { Authorization: `token ${ghAccessToken}`, "User-Agent": "Firebase CLI" };
  return await githubApiClient.put<any, { status: any }>(
    `/repos/${repo}/actions/secrets/${secretName}`,
    data,
    { headers },
  );
}

async function promptForRepo(
  options: any,
  ghAccessToken: string,
): Promise<{ repo: string; key: string; keyId: string }> {
  let key = "";
  let keyId = "";
  const { repo } = await prompt(options, [
    {
      type: "input",
      name: "repo",
      default: defaultGithubRepo(), // TODO look at github origin
      message:
        "For which GitHub repository would you like to set up a GitHub workflow? (format: user/repository)",
      validate: async (repo: string) => {
        try {
          const { body } = await githubApiClient.get<{ key: string; key_id: string }>(
            `/repos/${repo}/actions/secrets/public-key`,
            {
              headers: { Authorization: `token ${ghAccessToken}`, "User-Agent": "Firebase CLI" },
              queryParams: { type: "owner" },
            },
          );
          key = body.key;
          keyId = body.key_id;
        } catch (e: any) {
          if ([403, 404].includes(e.status)) {
            logger.info();
            logger.info();
            logWarning(
              "The provided authorization cannot be used with this repository. If this repository is in an organization, did you remember to grant access?",
              "error",
            );
            logger.info();
            logLabeledBullet(
              "Action required",
              `Visit this URL to ensure access has been granted to the appropriate organization(s) for the Firebase CLI GitHub OAuth App:`,
            );
            logger.info(
              bold(
                underline(`https://github.com/settings/connections/applications/${githubClientId}`),
              ),
            );
            logger.info();
          }
          return false;
        }
        return true;
      },
    },
  ]);
  return { repo, key, keyId };
}

async function promptForBuildScript(): Promise<{ script?: string }> {
  const { shouldSetupScript } = await prompt({}, [
    {
      type: "confirm",
      name: "shouldSetupScript",
      default: false,
      message: "Set up the workflow to run a build script before every deploy?",
    },
  ]);

  if (!shouldSetupScript) {
    return { script: undefined };
  }

  const { script } = await prompt({}, [
    {
      type: "input",
      name: "script",
      default: "npm ci && npm run build",
      message: "What script should be run before every deploy?",
    },
  ]);

  return { script };
}

async function promptToSetupDeploys(
  defaultBranch: string,
): Promise<{ setupDeploys: boolean; branch?: string }> {
  const { setupDeploys } = await prompt({}, [
    {
      type: "confirm",
      name: "setupDeploys",
      default: true,
      message: "Set up automatic deployment to your site's live channel when a PR is merged?",
    },
  ]);

  if (!setupDeploys) {
    return { setupDeploys };
  }

  const { branch } = await prompt({}, [
    {
      type: "input",
      name: "branch",
      default: defaultBranch,
      message: "What is the name of the GitHub branch associated with your site's live channel?",
    },
  ]);
  return { branch, setupDeploys };
}

async function promptForWriteYMLFile({ message }: { message: string }) {
  return await prompt({}, [
    {
      type: "confirm",
      name: "overwrite",
      default: false,
      message,
    },
  ]);
}

async function getGitHubUserDetails(ghAccessToken: any): Promise<Record<string, any>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { body: ghUserDetails } = await githubApiClient.get<Record<string, any>>("/user", {
    headers: { Authorization: `token ${ghAccessToken}`, "User-Agent": "Firebase CLI" },
  });
  return ghUserDetails;
}

async function getRepoDetails(repo: string, ghAccessToken: string) {
  const { body } = await githubApiClient.get<{ default_branch: string; id: string }>(
    `/repos/${repo}`,
    {
      headers: { Authorization: `token ${ghAccessToken}`, "User-Agent": "Firebase CLI" },
    },
  );
  return body;
}

async function signInWithGitHub() {
  return await loginGithub();
}

async function createServiceAccountAndKeyWithRetry(
  options: any,
  repo: string,
  accountId: string,
): Promise<string> {
  const spinnerServiceAccount = ora("Retrieving a service account.");
  spinnerServiceAccount.start();

  try {
    const serviceAccountJSON = await createServiceAccountAndKey(options, repo, accountId);
    spinnerServiceAccount.stop();
    return serviceAccountJSON;
  } catch (e: any) {
    spinnerServiceAccount.stop();
    if (!e.message.includes("429")) {
      const serviceAccountKeys = await listServiceAccountKeys(options.projectId, accountId);
      if (serviceAccountKeys.length >= SERVICE_ACCOUNT_MAX_KEY_NUMBER) {
        throw new FirebaseError(
          `You cannot add another key because the service account ${bold(
            accountId,
          )} already contains the max number of keys: ${SERVICE_ACCOUNT_MAX_KEY_NUMBER}.`,
          {
            original: e,
            exit: 1,
          },
        );
      }
      throw e;
    }

    // TODO prompt if they want to recreate the service account
    spinnerServiceAccount.start();
    await deleteServiceAccount(
      options.projectId,
      `${accountId}@${options.projectId}.iam.gserviceaccount.com`,
    );
    const serviceAccountJSON = await createServiceAccountAndKey(options, repo, accountId);
    spinnerServiceAccount.stop();
    return serviceAccountJSON;
  }
}

async function createServiceAccountAndKey(
  options: any,
  repo: string,
  accountId: string,
): Promise<string> {
  try {
    await createServiceAccount(
      options.projectId,
      accountId,
      `A service account with permission to deploy to Firebase Hosting and Cloud Functions for the GitHub repository ${repo}`,
      `GitHub Actions (${repo})`,
    );
  } catch (e: any) {
    // No need to throw if there is an existing service account
    if (!e.message.includes("409")) {
      throw e;
    }
  }

  // Service account roles
  const requiredRoles = [
    // Required to add preview URLs to Auth authorized domains
    // https://github.com/firebase/firebase-tools/issues/2732
    firebaseRoles.authAdmin,

    // Required for CLI deploys
    firebaseRoles.apiKeysViewer,

    // Required to deploy preview channels
    firebaseRoles.hostingAdmin,

    // Required for projects that use Hosting rewrites to Cloud Run
    firebaseRoles.runViewer,

    // Required for previewing backends (Web Frameworks and pinTags)
    firebaseRoles.functionsDeveloper,
  ];
  await addServiceAccountToRoles(options.projectId, accountId, requiredRoles);

  const serviceAccountKey = await createServiceAccountKey(options.projectId, accountId);
  const buf = Buffer.from(serviceAccountKey.privateKeyData, "base64");
  const serviceAccountJSON = buf.toString();
  return serviceAccountJSON;
  /*
    TODO if too many keys error, delete service account and retry on prompt
    await deleteServiceAccount(
      options.projectId,
      `${accountId}@${options.projectId}.iam.gserviceaccount.com`
    );
    return createServiceAccountAndKey(options, repo, accountId);
  */
}

/**
 * Encrypt service account to prepare to upload as a secret
 * using the method recommended in the GitHub docs:
 * https://developer.github.com/v3/actions/secrets/#create-or-update-a-repository-secret
 *
 * @param serviceAccountJSON A service account's JSON private key
 * @param key a GitHub repository's public key
 *
 * @return The encrypted service account key
 */
async function encryptServiceAccountJSON(serviceAccountJSON: string, key: string): Promise<string> {
  const messageBytes = Buffer.from(serviceAccountJSON);
  const keyBytes = Buffer.from(key, "base64");

  // Encrypt using LibSodium.
  await libsodium.ready;
  const encryptedBytes = libsodium.crypto_box_seal(messageBytes, keyBytes);

  // Base64 the encrypted secret
  return Buffer.from(encryptedBytes).toString("base64");
}

export function isRunningInGithubAction() {
  return process.env.GITHUB_ACTION_REPOSITORY === HOSTING_GITHUB_ACTION_NAME.split("@")[0];
}
