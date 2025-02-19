import { developerConnectOrigin } from "../../api";
import * as devConnect from "../../gcp/devConnect";
import * as poller from "../../operation-poller";
import * as utils from "../../utils";
import { promptOnce } from "../../prompt";
import { FirebaseError } from "../../error";

export const devConnectPollerOptions: Omit<poller.OperationPollerOptions, "operationResourceName"> =
  {
    apiOrigin: developerConnectOrigin(),
    apiVersion: "v1",
    masterTimeout: 25 * 60 * 1_000,
    maxBackoff: 10_000,
  };

const CONNECTION_NAME_REGEX =
  /^projects\/(?<projectId>[^\/]+)\/locations\/(?<location>[^\/]+)\/connections\/(?<id>[^\/]+)$/;
const APPHOSTING_CONN_PATTERN = /.+\/apphosting-github-conn-.+$/;

interface ConnectionNameParts {
  projectId: string;
  location: string;
  id: string;
}

/**
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

/**
 * Generates connection id that matches specific id format recognized by all Firebase clients.
 */
export function generateConnectionId(): string {
  const randomHash = Math.random().toString(36).slice(6);
  return `apphosting-github-conn-${randomHash}`;
}

/**
 * Exported for unit testing.
 *
 * Generates a repository ID.
 * The relation is 1:* between Developer Connect Connection and GitHub Repositories.
 */
export function generateRepositoryId(remoteUri: string): string | undefined {
  return devConnect.extractRepoSlugFromUri(remoteUri)?.replaceAll("/", "-");
}

/**
 * A "valid" installation is either the user's account itself or any orgs they
 * have access to that the GitHub app has been installed on.
 */
export async function listValidInstallations(
  projectId: string,
  location: string,
  connection: devConnect.Connection,
): Promise<devConnect.Installation[]> {
  const { id: connId } = parseConnectionName(connection.name)!;
  let installations = await devConnect.fetchGitHubInstallations(projectId, location, connId);

  installations = installations.filter((installation) => {
    return (
      (installation.type === "user" &&
        installation.name === connection.githubConfig?.authorizerCredential?.username) ||
      installation.type === "organization"
    );
  });

  return installations;
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
 * Gets or creates a new Developer Connect Connection resource. Will typically need some initialization
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
 * Lists all App Hosting Developer Connect Connections
 * not including the OAuth Connection
 *
 * Exported for unit testing.
 */
export async function listAppHostingConnections(
  projectId: string,
  location: string,
): Promise<devConnect.Connection[]> {
  const conns = await devConnect.listAllConnections(projectId, location);

  return conns.filter(
    (conn) =>
      APPHOSTING_CONN_PATTERN.test(conn.name) &&
      conn.installationState.stage === "COMPLETE" &&
      !conn.disabled,
  );
}

/**
 * Gets the oldest matching Dev Connect connection resource for a GitHub app installation.
 */
export async function getConnectionForInstallation(
  projectId: string,
  location: string,
  installationId: string,
): Promise<devConnect.Connection | null> {
  const connections = await listAppHostingConnections(projectId, location);
  const connectionsMatchingInstallation = connections.filter(
    (conn) => conn.githubConfig?.appInstallationId === installationId,
  );

  if (connectionsMatchingInstallation.length === 0) {
    return null;
  }

  if (connectionsMatchingInstallation.length > 1) {
    /**
     * In the Firebase Console and previous versions of the CLI we create a
     * connection and then choose an installation, which makes it possible for
     * there to be more than one connection for the same installation.
     *
     * To handle this case gracefully we return the oldest matching connection.
     */
    const sorted = devConnect.sortConnectionsByCreateTime(connectionsMatchingInstallation);
    return sorted[0];
  }

  return connectionsMatchingInstallation[0];
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
 * @param installationId represents an installation of the Firebase App Hosting GitHub app on a GitHub account / org
 */
export async function createFullyInstalledConnection(
  projectId: string,
  location: string,
  connectionId: string,
  oauthConn: devConnect.Connection,
  installationId: string,
): Promise<devConnect.Connection> {
  let conn = await createConnection(projectId, location, connectionId, {
    appInstallationId: installationId,
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

/**
 * Gets or creates a new Developer Connect GitRepositoryLink resource on a Developer Connect connection.
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
 * Fetch the git clone url using a Developer Connect GitRepositoryLink.
 *
 * Exported for unit testing.
 */
export async function fetchRepositoryCloneUris(
  projectId: string,
  connection: devConnect.Connection,
): Promise<string[]> {
  const { location, id } = parseConnectionName(connection.name)!;
  const connectionRepos = await devConnect.listAllLinkableGitRepositories(projectId, location, id);
  const cloneUris = connectionRepos.map((conn) => conn.cloneUri);

  return cloneUris;
}
