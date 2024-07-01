import * as clc from "colorette";

import * as devConnect from "../gcp/devConnect";
import * as rm from "../gcp/resourceManager";
import * as poller from "../operation-poller";
import * as utils from "../utils";
import { FirebaseError } from "../error";
import { promptOnce } from "../prompt";
import { getProjectNumber } from "../getProjectNumber";
import { developerConnectOrigin } from "../api";

import * as fuzzy from "fuzzy";
import * as inquirer from "inquirer";

interface ConnectionNameParts {
  projectId: string;
  location: string;
  id: string;
}

// Note: This does not match the sentinel oauth connection
const APPHOSTING_CONN_PATTERN = /.+\/apphosting-github-conn-.+$/;
const APPHOSTING_OAUTH_CONN_NAME = "apphosting-github-oauth";
const CONNECTION_NAME_REGEX =
  /^projects\/(?<projectId>[^\/]+)\/locations\/(?<location>[^\/]+)\/connections\/(?<id>[^\/]+)$/;

/**
 * Exported for unit testing.
 *
 * Example: /projects/my-project/locations/us-central1/connections/my-connection-id => {
 *   projectId: "my-project",
 *   location: "us-central1",
 *   id: "my-connection-id",
 * }
 */
export function parseConnectionName(name: string): ConnectionNameParts | undefined {
  const match = CONNECTION_NAME_REGEX.exec(name);

  if (!match || typeof match.groups === undefined) {
    return;
  }
  const { projectId, location, id } = match.groups as unknown as ConnectionNameParts;
  return {
    projectId,
    location,
    id,
  };
}

const devConnectPollerOptions: Omit<poller.OperationPollerOptions, "operationResourceName"> = {
  apiOrigin: developerConnectOrigin(),
  apiVersion: "v1",
  masterTimeout: 25 * 60 * 1_000,
  maxBackoff: 10_000,
};

/**
 * Exported for unit testing.
 *
 * Example usage:
 * extractRepoSlugFromURI("https://github.com/user/repo.git") => "user/repo"
 */
export function extractRepoSlugFromUri(cloneUri: string): string | undefined {
  const match = /github.com\/(.+).git/.exec(cloneUri);
  if (!match) {
    return undefined;
  }
  return match[1];
}

/**
 * Exported for unit testing.
 *
 * Generates a repository ID.
 * The relation is 1:* between Developer Connect Connection and GitHub Repositories.
 */
export function generateRepositoryId(remoteUri: string): string | undefined {
  return extractRepoSlugFromUri(remoteUri)?.replaceAll("/", "-");
}

/**
 * Generates connection id that matches specific id format recognized by all Firebase clients.
 */
function generateConnectionId(): string {
  const randomHash = Math.random().toString(36).slice(6);
  return `apphosting-github-conn-${randomHash}`;
}

const ADD_ACCOUNT_CHOICE = "@ADD_ACCOUNT";
const ADD_CONN_CHOICE = "@ADD_CONN";

/**
 * Prompts the user to link their backend to a GitHub repository.
 */
export async function linkGitHubRepository(
  projectId: string,
  location: string,
): Promise<devConnect.GitRepositoryLink> {
  utils.logBullet(clc.bold(`${clc.yellow("===")} Import a GitHub repository`));
  // Fetch the sentinel Oauth connection first which is needed to create further GitHub connections.
  const oauthConn = await getOrCreateOauthConnection(projectId, location);
  const { id: oauthConnId } = parseConnectionName(oauthConn.name)!;
  let installationId = await promptGitHubInstallation(projectId, location, oauthConnId);
  /**
   * TODO: if installation == Add_CONN redirect user to the Firebase App Hosting GitHub app installation page. Direct Link.
   */
  while (installationId === ADD_ACCOUNT_CHOICE) {
    utils.logBullet(
      "Install the Firebase App Hosting GitHub app on a new account to enable access to those repositories",
    );
    const targetUri = "https://github.com/apps/firebase-app-hosting/installations/new";
    utils.logBullet(targetUri);
    await utils.openInBrowser(targetUri);
    await promptOnce({
      type: "input",
      message:
        "Press Enter once you have installed or configured the Firebase App Hosting GitHub app to access your GitHub repo.",
    });
    installationId = await promptGitHubInstallation(projectId, location, oauthConnId);
  }

  console.log(`selected installation: ${JSON.stringify(installationId)}`);
  let connectionMatchingInstallation = await getConnectionForInstallation(
    projectId,
    installationId,
  );
  console.log(`connectionMatchingInstallation: ${JSON.stringify(connectionMatchingInstallation)}`);

  if (!connectionMatchingInstallation) {
    connectionMatchingInstallation = await createFullyInstalledConnection(
      projectId,
      location,
      generateConnectionId(),
      oauthConn,
      installationId,
    );
  }

  let repoCloneUri: string | undefined;

  do {
    if (repoCloneUri === ADD_CONN_CHOICE) {
      await manageInstallation(connectionMatchingInstallation);
    }

    repoCloneUri = await promptCloneUri(projectId, connectionMatchingInstallation);
  } while (repoCloneUri === ADD_CONN_CHOICE);

  // Ensure that the selected connection exists in the same region as the backend
  const { id: connectionId } = parseConnectionName(connectionMatchingInstallation.name)!;
  await getOrCreateConnection(projectId, location, connectionId, {
    authorizerCredential: connectionMatchingInstallation.githubConfig?.authorizerCredential,
    appInstallationId: connectionMatchingInstallation.githubConfig?.appInstallationId,
  });

  const repo = await getOrCreateRepository(projectId, location, connectionId, repoCloneUri);
  return repo;
}

/**
 * Creates a new DevConnect GitHub connection resource and ensures that it is fully configured on the GitHub
 * side (ie associated with an account/org and some subset of repos within that scope).
 * Copies over Oauth creds from the sentinel Oauth connection to save the user from having to
 * reauthenticate with GitHub.
 * @param projectId user's Firebase projectID
 * @param location region where backend is being created
 * @param connectionId id of connection to be created
 * @param oauthConn user's oauth connection
 * @param withNewInstallation Defaults to false if not set, and the Oauth connection's
 *                            Installation Id is re-used when creating a new connection.
 *                            If true the Oauth connection's installation Id is not re-used.
 */
async function createFullyInstalledConnection(
  projectId: string,
  location: string,
  connectionId: string,
  oauthConn: devConnect.Connection,
  withExistingInstallationId: string | undefined = undefined,
): Promise<devConnect.Connection> {
  let conn = await createConnection(projectId, location, connectionId, {
    appInstallationId: withExistingInstallationId,
    authorizerCredential: oauthConn.githubConfig?.authorizerCredential,
  });

  while (conn.installationState.stage !== "COMPLETE") {
    utils.logBullet(
      "Install the Firebase App Hosting GitHub app to enable access to GitHub repositories",
    );
    const targetUri = conn.installationState.actionUri;
    utils.logBullet(targetUri);
    await utils.openInBrowser(targetUri);
    await promptOnce({
      type: "input",
      message:
        "Press Enter once you have installed or configured the Firebase App Hosting GitHub app to access your GitHub repo.",
    });
    conn = await devConnect.getConnection(projectId, location, connectionId);
  }

  return conn;
}

async function manageInstallation(connection: devConnect.Connection): Promise<void> {
  utils.logBullet(
    "Manage the Firebase App Hosting GitHub app to enable access to GitHub repositories",
  );
  const targetUri = connection.githubConfig?.installationUri;
  if (!targetUri) {
    throw new Error("No installation given to manage");
  }

  utils.logBullet(targetUri);
  await utils.openInBrowser(targetUri);
  await promptOnce({
    type: "input",
    message:
      "Press Enter once you have installed or configured the Firebase App Hosting GitHub app to access your GitHub repo.",
  });
}

export async function getConnectionForInstallation(
  projectId: string,
  installationId: string,
): Promise<devConnect.Connection | null> {
  const connections = await listAppHostingConnections(projectId);
  const connectionsMatchingInstallation = connections.filter(
    (conn) => conn.githubConfig?.appInstallationId === installationId,
  );
  if (connectionsMatchingInstallation.length == 0) {
    return null;
  }

  if (connectionsMatchingInstallation.length > 1) {
    // return the oldest connection (TODO: Figure out how to use the orderBy query param)
    return connectionsMatchingInstallation[0];
  }

  return connectionsMatchingInstallation[0];
}

export async function promptGitHubInstallation(
  projectId: string,
  location: string,
  connectionId: string,
): Promise<string> {
  const installations = await devConnect.fetchGitHubInstallations(
    projectId,
    location,
    connectionId,
  );

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
  try {
    conn = await devConnect.getConnection(projectId, location, APPHOSTING_OAUTH_CONN_NAME);
  } catch (err: unknown) {
    if ((err as any).status === 404) {
      // Cloud build P4SA requires the secret manager admin role.
      // This is required when creating an initial connection which is the Oauth connection in our case.
      await ensureSecretManagerAdminGrant(projectId);
      conn = await createConnection(projectId, location, APPHOSTING_OAUTH_CONN_NAME);
    } else {
      throw err;
    }
  }

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
  const connectionRepos = await fetchRepositories(projectId, connection);
  const cloneUris = connectionRepos.map((conn) => conn.cloneUri);

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
            value: ADD_CONN_CHOICE,
          },
          new inquirer.Separator(),
          ...fuzzy
            .filter(input, cloneUris, {
              extract: (uri) => extractRepoSlugFromUri(uri) || "",
            })
            .map((result) => {
              return {
                name: extractRepoSlugFromUri(result.original) || "",
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
 * Creates a new Developer Connect Connection resource. Will typically need some initialization
 * or configuration after being created.
 */
export async function createConnection(
  projectId: string,
  location: string,
  connectionId: string,
  githubConfig?: devConnect.GitHubConfig,
): Promise<devConnect.Connection> {
  const op = await devConnect.createConnection(projectId, location, connectionId, githubConfig);
  const conn = await poller.pollOperation<devConnect.Connection>({
    ...devConnectPollerOptions,
    pollerName: `create-${location}-${connectionId}`,
    operationResourceName: op.name,
  });
  return conn;
}

/**
 * Exported for unit testing.
 */
export async function getOrCreateConnection(
  projectId: string,
  location: string,
  connectionId: string,
  githubConfig?: devConnect.GitHubConfig,
): Promise<devConnect.Connection> {
  let conn: devConnect.Connection;
  try {
    conn = await devConnect.getConnection(projectId, location, connectionId);
  } catch (err: unknown) {
    if ((err as any).status === 404) {
      utils.logBullet("creating connection");
      conn = await createConnection(projectId, location, connectionId, githubConfig);
    } else {
      throw err;
    }
  }
  return conn;
}

/**
 * Exported for unit testing.
 */
export async function getOrCreateRepository(
  projectId: string,
  location: string,
  connectionId: string,
  cloneUri: string,
): Promise<devConnect.GitRepositoryLink> {
  const repositoryId = generateRepositoryId(cloneUri);
  if (!repositoryId) {
    throw new FirebaseError(`Failed to generate repositoryId for URI "${cloneUri}".`);
  }
  let repo: devConnect.GitRepositoryLink;
  try {
    repo = await devConnect.getGitRepositoryLink(projectId, location, connectionId, repositoryId);
  } catch (err: unknown) {
    if ((err as FirebaseError).status === 404) {
      const op = await devConnect.createGitRepositoryLink(
        projectId,
        location,
        connectionId,
        repositoryId,
        cloneUri,
      );
      repo = await poller.pollOperation<devConnect.GitRepositoryLink>({
        ...devConnectPollerOptions,
        pollerName: `create-${location}-${connectionId}-${repositoryId}`,
        operationResourceName: op.name,
      });
    } else {
      throw err;
    }
  }
  return repo;
}

/**
 * Exported for unit testing.
 *
 * Lists all App Hosting Developer Connect Connections
 * not including the OAuth Connection
 */
export async function listAppHostingConnections(
  projectId: string,
): Promise<devConnect.Connection[]> {
  /**
   * TODO: query connections by location
   */
  const conns = await devConnect.listAllConnections(projectId, "-");
  return conns.filter(
    (conn) =>
      APPHOSTING_CONN_PATTERN.test(conn.name) &&
      conn.installationState.stage === "COMPLETE" &&
      !conn.disabled,
  );
}

/**
 * Exported for unit testing.
 */
export async function fetchRepositories(
  projectId: string,
  connection: devConnect.Connection,
): Promise<devConnect.LinkableGitRepository[]> {
  const { location, id } = parseConnectionName(connection.name)!;
  const connectionRepos = await devConnect.listAllLinkableGitRepositories(projectId, location, id);
  return connectionRepos;
}
