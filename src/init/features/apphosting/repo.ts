import * as clc from "colorette";

import * as gcb from "../../../gcp/cloudbuild";
import * as rm from "../../../gcp/resourceManager";
import * as poller from "../../../operation-poller";
import * as utils from "../../../utils";
import { cloudbuildOrigin } from "../../../api";
import { FirebaseError } from "../../../error";
import { promptOnce } from "../../../prompt";
import { getProjectNumber } from "../../../getProjectNumber";

import * as fuzzy from "fuzzy";
import * as inquirer from "inquirer";

export interface ConnectionNameParts {
  projectId: string;
  location: string;
  id: string;
}

const APPHOSTING_CONN_PATTERN = /.+\/apphosting-github-conn-.+$/;
const APPHOSTING_OAUTH_CONN_NAME = "apphosting-github-oauth";
const CONNECTION_NAME_REGEX =
  /^projects\/(?<projectId>[^\/]+)\/locations\/(?<location>[^\/]+)\/connections\/(?<id>[^\/]+)$/;

/**
 * Exported for unit testing.
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

const gcbPollerOptions: Omit<poller.OperationPollerOptions, "operationResourceName"> = {
  apiOrigin: cloudbuildOrigin,
  apiVersion: "v2",
  masterTimeout: 25 * 60 * 1_000,
  maxBackoff: 10_000,
};

/**
 * Example usage:
 * extractRepoSlugFromURI("https://github.com/user/repo.git") => "user/repo"
 */
function extractRepoSlugFromUri(remoteUri: string): string | undefined {
  const match = /github.com\/(.+).git/.exec(remoteUri);
  if (!match) {
    return undefined;
  }
  return match[1];
}

/**
 * Generates a repository ID.
 * The relation is 1:* between Cloud Build Connection and GitHub Repositories.
 */
function generateRepositoryId(remoteUri: string): string | undefined {
  return extractRepoSlugFromUri(remoteUri)?.replaceAll("/", "-");
}

/**
 * Generates connection id that matches specific id format recognized by all Firebase clients.
 */
function generateConnectionId(): string {
  const randomHash = Math.random().toString(36).slice(6);
  return `apphosting-github-conn-${randomHash}`;
}

const ADD_REPO_CHOICE = "@ADD_REPO";
const ADD_CONN_CHOICE = "@ADD_CONN";
const CONFIGURE_REMOTE_URI_CHOICES = [ADD_REPO_CHOICE, ADD_CONN_CHOICE];

/**
 * Prompts the user to link their backend to a GitHub repository.
 */
export async function linkGitHubRepository(
  projectId: string,
  location: string,
): Promise<gcb.Repository> {
  utils.logBullet(clc.bold(`${clc.yellow("===")} Set up a GitHub connection`));
  // Create or get connection resource that contains reference to the GitHub oauth token.
  // Oauth token associated with this connection should be used to create other connection resources.
  let oauthConn = await getOrCreateConnection(projectId, location, APPHOSTING_OAUTH_CONN_NAME);
  while (oauthConn.installationState.stage === "PENDING_USER_OAUTH") {
    oauthConn = await promptConnectionAuth(oauthConn);
  }
  const existingConns = await listAppHostingConnections(projectId);
  if (existingConns.length < 1) {
    const grantSuccess = await promptSecretManagerAdminGrant(projectId);
    if (!grantSuccess) {
      throw new FirebaseError("Insufficient IAM permissions to create a new connection to GitHub");
    }
    const connectionId = generateConnectionId();
    const conn = await createConnection(projectId, location, connectionId, {
      authorizerCredential: oauthConn.githubConfig?.authorizerCredential,
    });
    let refreshedConn = conn;
    while (refreshedConn.installationState.stage !== "COMPLETE") {
      refreshedConn = await promptAppInstall(conn);
    }
    existingConns.push(refreshedConn);
  }

  let { remoteUri, connection } = await promptRepositoryUri(projectId, existingConns);
  while (CONFIGURE_REMOTE_URI_CHOICES.includes(remoteUri)) {
    if (remoteUri === ADD_REPO_CHOICE) {
      await utils.openInBrowser("https://github.com/apps/google-cloud-build/installations/new");
      await promptOnce({
        type: "input",
        message:
          "Press ENTER once you have provided the GitHub app installation with access to your desired repository.",
      });
    } else if (remoteUri === ADD_CONN_CHOICE) {
      const connectionId = generateConnectionId();
      const conn = await createConnection(projectId, location, connectionId, {
        authorizerCredential: oauthConn.githubConfig?.authorizerCredential,
      });
      let refreshedConn = conn;
      while (refreshedConn.installationState.stage !== "COMPLETE") {
        refreshedConn = await promptAppInstall(conn);
      }
      existingConns.push(refreshedConn);
    }

    const selection = await promptRepositoryUri(projectId, existingConns);
    remoteUri = selection.remoteUri;
    connection = selection.connection;
  }

  // Ensure that the selected connection exists in the same region as the backend
  const { id: connectionId } = parseConnectionName(connection.name)!;
  await getOrCreateConnection(projectId, location, connectionId, {
    authorizerCredential: connection.githubConfig?.authorizerCredential,
    appInstallationId: connection.githubConfig?.appInstallationId,
  });
  const repo = await getOrCreateRepository(projectId, location, connectionId, remoteUri);
  utils.logSuccess(`Successfully linked GitHub repository at remote URI`);
  utils.logSuccess(`\t${remoteUri}`);
  return repo;
}

async function promptRepositoryUri(
  projectId: string,
  connections: gcb.Connection[],
): Promise<{ remoteUri: string; connection: gcb.Connection }> {
  const { repos, remoteUriToConnection } = await fetchAllRepositories(projectId, connections);
  const searchRepos =
    (repos: gcb.Repository[]) =>
    // eslint-disable-next-line @typescript-eslint/require-await, @typescript-eslint/no-explicit-any
    async (_: any, input = ""): Promise<(inquirer.DistinctChoice | inquirer.Separator)[]> => {
      return [
        new inquirer.Separator(),
        {
          name: "Missing a repo? Select this option to configure your installation's access settings",
          value: ADD_REPO_CHOICE,
        },
        {
          name: "Missing an account or org? Select this option to create a new connection",
          value: ADD_CONN_CHOICE,
        },
        new inquirer.Separator(),
        ...fuzzy
          .filter(input, repos, {
            extract: (repo) => extractRepoSlugFromUri(repo.remoteUri) || "",
          })
          .map((result) => {
            return {
              name: extractRepoSlugFromUri(result.original.remoteUri) || "",
              value: result.original.remoteUri,
            };
          }),
      ];
    };

  const remoteUri = await promptOnce({
    type: "autocomplete",
    name: "remoteUri",
    message: "Which of the following repositories would you like to deploy?",
    source: searchRepos(repos),
  });
  return { remoteUri, connection: remoteUriToConnection[remoteUri] };
}

async function promptSecretManagerAdminGrant(projectId: string): Promise<boolean> {
  const projectNumber = await getProjectNumber({ projectId });
  const cbsaEmail = gcb.serviceAgentEmail(projectNumber);

  const alreadyGranted = await rm.serviceAccountHasRoles(
    projectId,
    cbsaEmail,
    ["roles/secretmanager.admin"],
    true,
  );
  if (alreadyGranted) {
    return true;
  }

  utils.logBullet(
    "To create a new GitHub connection, Secret Manager Admin role (roles/secretmanager.admin) is required on the Cloud Build Service Agent.",
  );
  const grant = await promptOnce({
    type: "confirm",
    message: "Grant the required role to the Cloud Build Service Agent?",
  });
  if (!grant) {
    utils.logBullet(
      "You, or your project administrator, should run the following command to grant the required role:\n\n" +
        "You, or your project adminstrator, can run the following command to grant the required role manually:\n\n" +
        `\tgcloud projects add-iam-policy-binding ${projectId} \\\n` +
        `\t  --member="serviceAccount:${cbsaEmail} \\\n` +
        `\t  --role="roles/secretmanager.admin\n`,
    );
    return false;
  }
  await rm.addServiceAccountToRoles(projectId, cbsaEmail, ["roles/secretmanager.admin"], true);
  utils.logSuccess("Successfully granted the required role to the Cloud Build Service Agent!");
  return true;
}

async function promptConnectionAuth(conn: gcb.Connection): Promise<gcb.Connection> {
  utils.logBullet("You must authorize the Cloud Build GitHub app.");
  utils.logBullet("Sign in to GitHub and authorize Cloud Build GitHub app:");
  const { url, cleanup } = await utils.openInBrowserPopup(
    conn.installationState.actionUri,
    "Authorize the GitHub app",
  );
  utils.logBullet(`\t${url}`);
  await promptOnce({
    type: "input",
    message: "Press Enter once you have authorized the app",
  });
  cleanup();
  const { projectId, location, id } = parseConnectionName(conn.name)!;
  return await gcb.getConnection(projectId, location, id);
}

async function promptAppInstall(conn: gcb.Connection): Promise<gcb.Connection> {
  utils.logBullet("Install the Cloud Build GitHub app to enable access to GitHub repositories");
  const targetUri = conn.installationState.actionUri.replace("install_v2", "direct_install_v2");
  utils.logBullet(targetUri);
  await utils.openInBrowser(targetUri);
  await promptOnce({
    type: "input",
    message:
      "Press Enter once you have installed or configured the Cloud Build GitHub app to access your GitHub repo.",
  });
  const { projectId, location, id } = parseConnectionName(conn.name)!;
  return await gcb.getConnection(projectId, location, id);
}

/**
 * Creates a new Cloud Build Connection resource.
 */
export async function createConnection(
  projectId: string,
  location: string,
  connectionId: string,
  githubConfig?: gcb.GitHubConfig,
): Promise<gcb.Connection> {
  const op = await gcb.createConnection(projectId, location, connectionId, githubConfig);
  const conn = await poller.pollOperation<gcb.Connection>({
    ...gcbPollerOptions,
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
  githubConfig?: gcb.GitHubConfig,
): Promise<gcb.Connection> {
  let conn: gcb.Connection;
  try {
    conn = await gcb.getConnection(projectId, location, connectionId);
  } catch (err: unknown) {
    if ((err as any).status === 404) {
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
  remoteUri: string,
): Promise<gcb.Repository> {
  const repositoryId = generateRepositoryId(remoteUri);
  if (!repositoryId) {
    throw new FirebaseError(`Failed to generate repositoryId for URI "${remoteUri}".`);
  }
  let repo: gcb.Repository;
  try {
    repo = await gcb.getRepository(projectId, location, connectionId, repositoryId);
  } catch (err: unknown) {
    if ((err as FirebaseError).status === 404) {
      const op = await gcb.createRepository(
        projectId,
        location,
        connectionId,
        repositoryId,
        remoteUri,
      );
      repo = await poller.pollOperation<gcb.Repository>({
        ...gcbPollerOptions,
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
 */
export async function listAppHostingConnections(projectId: string) {
  const conns = await gcb.listConnections(projectId, "-");
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
export async function fetchAllRepositories(
  projectId: string,
  connections: gcb.Connection[],
): Promise<{ repos: gcb.Repository[]; remoteUriToConnection: Record<string, gcb.Connection> }> {
  const repos: gcb.Repository[] = [];
  const remoteUriToConnection: Record<string, gcb.Connection> = {};

  const getNextPage = async (conn: gcb.Connection, pageToken = ""): Promise<void> => {
    const { location, id } = parseConnectionName(conn.name)!;
    const resp = await gcb.fetchLinkableRepositories(projectId, location, id, pageToken);
    if (resp.repositories && resp.repositories.length > 0) {
      for (const repo of resp.repositories) {
        repos.push(repo);
        remoteUriToConnection[repo.remoteUri] = conn;
      }
    }
    if (resp.nextPageToken) {
      await getNextPage(conn, resp.nextPageToken);
    }
  };
  for (const conn of connections) {
    await getNextPage(conn);
  }
  return { repos, remoteUriToConnection };
}
