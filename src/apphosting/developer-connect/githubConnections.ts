import * as clc from "colorette";

import * as devConnect from "../../gcp/devConnect";
import * as rm from "../../gcp/resourceManager";
import * as utils from "../../utils";
import { FirebaseError } from "../../error";
import { promptOnce } from "../../prompt";
import { getProjectNumber } from "../../getProjectNumber";
import {
  generateConnectionId,
  listValidInstallations,
  parseConnectionName,
  getOrCreateConnection,
  createConnection,
  createFullyInstalledConnection,
  getConnectionForInstallation,
  listAppHostingConnections,
  getOrCreateRepository,
  fetchRepositoryCloneUris,
} from "./utils";
import { apphostingGitHubAppInstallationURL, githubApiOrigin } from "../../api";

import * as fuzzy from "fuzzy";
import * as inquirer from "inquirer";
import { Client } from "../../apiv2";

const githubApiClient = new Client({ urlPrefix: githubApiOrigin(), auth: false });

export interface GitHubBranchInfo {
  commit: GitHubCommitInfo;
}

export interface GitHubCommitInfo {
  sha: string;
  commit: GitHubCommit;
}

interface GitHubCommit {
  message: string;
}

const ADD_ACCOUNT_CHOICE = "@ADD_ACCOUNT";
const MANAGE_INSTALLATION_CHOICE = "@MANAGE_INSTALLATION";

/**
 * Prompts the user to create a GitHub connection.
 */
export async function getOrCreateFullyInstalledConnection(
  projectId: string,
  location: string,
  createConnectionId?: string,
): Promise<devConnect.Connection> {
  utils.logBullet(clc.bold(`${clc.yellow("===")} Import a GitHub repository`));

  if (createConnectionId) {
    // Check if the connection already exists.
    try {
      const connection = await devConnect.getConnection(projectId, location, createConnectionId);
      utils.logBullet(`Reusing existing connection ${createConnectionId}`);
      return connection;
    } catch (err: unknown) {
      // A 404 is expected if the connection doesn't exist. Otherwise, continue to throw the err.
      if ((err as any).status !== 404) {
        throw err;
      }
    }
  }

  // Fetch the sentinel Oauth connection first which is needed to create further GitHub connections.
  const oauthConn = await getOrCreateOauthConnection(projectId, location);
  let installationId = await promptGitHubInstallation(projectId, location, oauthConn);

  while (installationId === ADD_ACCOUNT_CHOICE) {
    utils.logBullet(
      "Install the Firebase App Hosting GitHub app on a new account to enable access to those repositories",
    );

    const apphostingGitHubInstallationURL = apphostingGitHubAppInstallationURL();
    utils.logBullet(apphostingGitHubInstallationURL);
    await utils.openInBrowser(apphostingGitHubInstallationURL);
    await promptOnce({
      type: "input",
      message:
        "Press Enter once you have installed or configured the Firebase App Hosting GitHub app to access your GitHub repo.",
    });
    installationId = await promptGitHubInstallation(projectId, location, oauthConn);
  }

  const connectionMatchingInstallation = await getConnectionForInstallation(
    projectId,
    location,
    installationId,
  );

  console.log(
    `connection matching installation: ${JSON.stringify(connectionMatchingInstallation)}`,
  );
  if (connectionMatchingInstallation) {
    const { id: matchingConnectionId } = parseConnectionName(connectionMatchingInstallation.name)!;

    if (!createConnectionId) {
      utils.logBullet(`Reusing matching connection ${matchingConnectionId}`);
      return connectionMatchingInstallation;
    }
  }
  if (!createConnectionId) {
    createConnectionId = generateConnectionId();
  }

  const connection = await createFullyInstalledConnection(
    projectId,
    location,
    createConnectionId,
    oauthConn,
    installationId,
  );

  return connection;
}

/**
 * Prompts the user to link their backend to a GitHub repository.
 */
export async function linkGitHubRepository(
  projectId: string,
  location: string,
  createConnectionId?: string,
): Promise<devConnect.GitRepositoryLink> {
  const connection = await getOrCreateFullyInstalledConnection(
    projectId,
    location,
    createConnectionId,
  );

  let repoCloneUri: string | undefined;

  do {
    if (repoCloneUri === MANAGE_INSTALLATION_CHOICE) {
      await manageInstallation(connection);
    }

    repoCloneUri = await promptCloneUri(projectId, connection);
  } while (repoCloneUri === MANAGE_INSTALLATION_CHOICE);

  const { id: connectionId } = parseConnectionName(connection.name)!;
  await getOrCreateConnection(projectId, location, connectionId, {
    authorizerCredential: connection.githubConfig?.authorizerCredential,
    appInstallationId: connection.githubConfig?.appInstallationId,
  });

  const repo = await getOrCreateRepository(projectId, location, connectionId, repoCloneUri);
  return repo;
}

async function manageInstallation(connection: devConnect.Connection): Promise<void> {
  utils.logBullet(
    "Manage the Firebase App Hosting GitHub app to enable access to GitHub repositories",
  );
  const targetUri = connection.githubConfig?.installationUri;
  if (!targetUri) {
    throw new FirebaseError("Failed to get Installation URI. Please try again.");
  }

  utils.logBullet(targetUri);
  await utils.openInBrowser(targetUri);
  await promptOnce({
    type: "input",
    message:
      "Press Enter once you have installed or configured the Firebase App Hosting GitHub app to access your GitHub repo.",
  });
}

/**
 * Prompts the user to select which GitHub account to install the GitHub app.
 */
export async function promptGitHubInstallation(
  projectId: string,
  location: string,
  connection: devConnect.Connection,
): Promise<string> {
  const installations = await listValidInstallations(projectId, location, connection);

  const installationName = await promptOnce({
    type: "autocomplete",
    name: "installation",
    message: "Which GitHub account do you want to use?",
    source: (_: any, input = ""): Promise<(inquirer.DistinctChoice | inquirer.Separator)[]> => {
      return new Promise((resolve) =>
        resolve([
          new inquirer.Separator(),
          {
            name: "Missing an account? Select this option to add a GitHub account",
            value: ADD_ACCOUNT_CHOICE,
          },
          new inquirer.Separator(),
          ...fuzzy
            .filter(input, installations, {
              extract: (installation) => installation.name || "",
            })
            .map((result) => {
              return {
                name: result.original.name || "",
                value: result.original.id,
              };
            }),
        ]),
      );
    },
  });

  return installationName;
}

/**
 * Gets or creates the sentinel GitHub connection resource that contains our Firebase-wide GitHub Oauth token.
 * This Oauth token can be used to create other connections without reprompting the user to grant access.
 */
export async function getOrCreateOauthConnection(
  projectId: string,
  location: string,
): Promise<devConnect.Connection> {
  let conn: devConnect.Connection;
  const completedConnections = await listAppHostingConnections(projectId, location);
  if (completedConnections.length > 0) {
    return completedConnections[0];
  }

  const connectionId = generateConnectionId();
  await ensureSecretManagerAdminGrant(projectId);
  conn = await createConnection(projectId, location, connectionId);

  while (conn.installationState.stage === "PENDING_USER_OAUTH") {
    utils.logBullet("Please authorize the Firebase GitHub app by visiting this url:");
    const { url, cleanup } = await utils.openInBrowserPopup(
      conn.installationState.actionUri,
      "Authorize the GitHub app",
    );
    utils.logBullet(`\t${url}`);
    await promptOnce({
      type: "input",
      message: "Press Enter once you have authorized the GitHub App.",
    });
    cleanup();
    const { projectId, location, id } = parseConnectionName(conn.name)!;
    conn = await devConnect.getConnection(projectId, location, id);
  }
  utils.logSuccess("Connected with GitHub successfully\n");

  return conn;
}

async function promptCloneUri(
  projectId: string,
  connection: devConnect.Connection,
): Promise<string> {
  const cloneUris = await fetchRepositoryCloneUris(projectId, connection);
  const cloneUri = await promptOnce({
    type: "autocomplete",
    name: "cloneUri",
    message: "Which GitHub repo do you want to deploy?",
    source: (_: any, input = ""): Promise<(inquirer.DistinctChoice | inquirer.Separator)[]> => {
      return new Promise((resolve) =>
        resolve([
          new inquirer.Separator(),
          {
            name: "Missing a repo? Select this option to configure your GitHub connection settings",
            value: MANAGE_INSTALLATION_CHOICE,
          },
          new inquirer.Separator(),
          ...fuzzy
            .filter(input, cloneUris, {
              extract: (uri) => devConnect.extractRepoSlugFromUri(uri) || "",
            })
            .map((result) => {
              return {
                name: devConnect.extractRepoSlugFromUri(result.original) || "",
                value: result.original,
              };
            }),
        ]),
      );
    },
  });

  return cloneUri;
}

/**
 * Prompts the user for a GitHub branch and validates that the given branch
 * actually exists. User is re-prompted until they enter a valid branch.
 */
export async function promptGitHubBranch(repoLink: devConnect.GitRepositoryLink): Promise<string> {
  const branches = await devConnect.listAllBranches(repoLink.name);
  const branch = await promptOnce({
    type: "autocomplete",
    name: "branch",
    message: "Pick a branch for continuous deployment",
    source: (_: any, input = ""): Promise<(inquirer.DistinctChoice | inquirer.Separator)[]> => {
      return new Promise((resolve) =>
        resolve([
          ...fuzzy.filter(input, Array.from(branches)).map((result) => {
            return {
              name: result.original,
              value: result.original,
            };
          }),
        ]),
      );
    },
  });

  utils.logWarning(
    `The branch "${branch}" does not exist on "${devConnect.extractRepoSlugFromUri(repoLink.cloneUri) ?? ""}". Please enter a valid branch for this repo.`,
  );
  return branch;
}

/**
 * Exported for unit testing
 */
export async function ensureSecretManagerAdminGrant(projectId: string): Promise<void> {
  const projectNumber = await getProjectNumber({ projectId });
  const dcsaEmail = devConnect.serviceAgentEmail(projectNumber);

  // will return false even if the service account does not exist in the project
  const alreadyGranted = await rm.serviceAccountHasRoles(
    projectId,
    dcsaEmail,
    ["roles/secretmanager.admin"],
    true,
  );
  if (alreadyGranted) {
    utils.logBullet("secret manager admin role already granted");
    return;
  }

  utils.logBullet(
    "To create a new GitHub connection, Secret Manager Admin role (roles/secretmanager.admin) is required on the Developer Connect Service Agent.",
  );
  const grant = await promptOnce({
    type: "confirm",
    message: "Grant the required role to the Developer Connect Service Agent?",
  });
  if (!grant) {
    utils.logBullet(
      "You, or your project administrator, should run the following command to grant the required role:\n\n" +
        "You, or your project adminstrator, can run the following command to grant the required role manually:\n\n" +
        `\tgcloud projects add-iam-policy-binding ${projectId} \\\n` +
        `\t  --member="serviceAccount:${dcsaEmail} \\\n` +
        `\t  --role="roles/secretmanager.admin\n`,
    );
    throw new FirebaseError("Insufficient IAM permissions to create a new connection to GitHub");
  }

  try {
    await rm.addServiceAccountToRoles(
      projectId,
      dcsaEmail,
      ["roles/secretmanager.admin"],
      /* skipAccountLookup= */ true,
    );
  } catch (e: any) {
    // if the dev connect P4SA doesn't exist in the project, generate one
    if (e?.code === 400 || e?.status === 400) {
      await devConnect.generateP4SA(projectNumber);
      await rm.addServiceAccountToRoles(
        projectId,
        dcsaEmail,
        ["roles/secretmanager.admin"],
        /* skipAccountLookup= */ true,
      );
    } else {
      throw e;
    }
  }

  utils.logSuccess(
    "Successfully granted the required role to the Developer Connect Service Agent!\n",
  );
}

/**
 * Gets the details of a GitHub branch from the GitHub REST API.
 */
export async function getGitHubBranch(
  owner: string,
  repo: string,
  branch: string,
  readToken: string,
): Promise<GitHubBranchInfo> {
  const headers = { Authorization: `Bearer ${readToken}`, "User-Agent": "Firebase CLI" };
  const { body } = await githubApiClient.get<GitHubBranchInfo>(
    `/repos/${owner}/${repo}/branches/${branch}`,
    {
      headers,
    },
  );
  return body;
}

/**
 * Gets the details of a GitHub commit from the GitHub REST API.
 */
export async function getGitHubCommit(
  owner: string,
  repo: string,
  ref: string,
  readToken: string,
): Promise<GitHubCommitInfo> {
  const headers = { Authorization: `Bearer ${readToken}`, "User-Agent": "Firebase CLI" };
  const { body } = await githubApiClient.get<GitHubCommitInfo>(
    `/repos/${owner}/${repo}/commits/${ref}`,
    {
      headers,
    },
  );
  return body;
}
