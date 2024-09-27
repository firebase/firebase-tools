import { Client } from "../apiv2";
import { developerConnectOrigin, developerConnectP4SADomain } from "../api";
import { generateServiceIdentityAndPoll } from "./serviceusage";
import { FirebaseError } from "../error";
import { extractRepoSlugFromUri } from "../apphosting/githubConnections";

const PAGE_SIZE_MAX = 1000;
const LOCATION_OVERRIDE = process.env.FIREBASE_DEVELOPERCONNECT_LOCATION_OVERRIDE;

export const client = new Client({
  urlPrefix: developerConnectOrigin(),
  auth: true,
  apiVersion: "v1",
});

export interface OperationMetadata {
  createTime: string;
  endTime: string;
  target: string;
  verb: string;
  requestedCancellation: boolean;
  apiVersion: string;
}

export interface Operation {
  name: string;
  metadata?: OperationMetadata;
  done: boolean;
  error?: { code: number; message: string; details: unknown };
  response?: any;
}

export interface OAuthCredential {
  oauthTokenSecretVersion: string;
  username: string;
}

type GitHubApp = "GIT_HUB_APP_UNSPECIFIED" | "DEVELOPER_CONNECT" | "FIREBASE";

export interface GitHubConfig {
  githubApp?: GitHubApp;
  authorizerCredential?: OAuthCredential;
  appInstallationId?: string;
  installationUri?: string;
}

type InstallationType = "user" | "organization";

export interface Installation {
  id: string;
  name: string;
  type: InstallationType;
}

type InstallationStage =
  | "STAGE_UNSPECIFIED"
  | "PENDING_CREATE_APP"
  | "PENDING_USER_OAUTH"
  | "PENDING_INSTALL_APP"
  | "COMPLETE";

export interface InstallationState {
  stage: InstallationStage;
  message: string;
  actionUri: string;
}

export interface Connection {
  name: string;
  createTime?: string;
  updateTime?: string;
  deleteTime?: string;
  labels?: {
    [key: string]: string;
  };
  githubConfig?: GitHubConfig;
  installationState: InstallationState;
  disabled?: boolean;
  reconciling?: boolean;
  annotations?: {
    [key: string]: string;
  };
  etag?: string;
  uid?: string;
}

type ConnectionOutputOnlyFields =
  | "createTime"
  | "updateTime"
  | "deleteTime"
  | "installationState"
  | "reconciling"
  | "uid";

export interface GitRepositoryLink {
  name: string;
  cloneUri: string;
  createTime: string;
  updateTime: string;
  deleteTime: string;
  labels?: {
    [key: string]: string;
  };
  etag?: string;
  reconciling: boolean;
  annotations?: {
    [key: string]: string;
  };
  uid: string;
}

type GitRepositoryLinkOutputOnlyFields =
  | "createTime"
  | "updateTime"
  | "deleteTime"
  | "reconciling"
  | "uid";

export interface LinkableGitRepositories {
  linkableGitRepositories: LinkableGitRepository[];
  nextPageToken: string;
}

export interface LinkableGitRepository {
  cloneUri: string;
}

interface GitRepositoryLinkReadToken {
  token: string;
  expirationTime: string;
  gitUsername: string;
}

export interface GitRepositoryLinkDetails {
  repoLink: GitRepositoryLink;
  owner: string;
  repo: string;
  readToken: GitRepositoryLinkReadToken;
}

/**
 * Creates a Developer Connect Connection.
 */
export async function createConnection(
  projectId: string,
  location: string,
  connectionId: string,
  githubConfig: GitHubConfig = {},
): Promise<Operation> {
  const config: GitHubConfig = {
    ...githubConfig,
    githubApp: "FIREBASE",
  };
  const res = await client.post<
    Omit<Omit<Connection, "name">, ConnectionOutputOnlyFields>,
    Operation
  >(
    `projects/${projectId}/locations/${LOCATION_OVERRIDE ?? location}/connections`,
    {
      githubConfig: config,
    },
    { queryParams: { connectionId } },
  );
  return res.body;
}

/**
 * Deletes a connection that matches the given parameters
 */
export async function deleteConnection(
  projectId: string,
  location: string,
  connectionId: string,
): Promise<Operation> {
  /**
   * TODO: specify a unique request ID so that if you must retry your request,
   * the server will know to ignore the request if it has already been
   * completed. The server will guarantee that for at least 60 minutes after
   * the first request.
   */
  const name = `projects/${projectId}/locations/${LOCATION_OVERRIDE ?? location}/connections/${connectionId}`;
  const res = await client.delete<Operation>(name, { queryParams: { force: "true" } });
  return res.body;
}

/**
 * Gets details of a single Developer Connect Connection.
 */
export async function getConnection(
  projectId: string,
  location: string,
  connectionId: string,
): Promise<Connection> {
  const name = `projects/${projectId}/locations/${LOCATION_OVERRIDE ?? location}/connections/${connectionId}`;
  const res = await client.get<Connection>(name);
  return res.body;
}

/**
 * List Developer Connect Connections
 */
export async function listAllConnections(
  projectId: string,
  location: string,
): Promise<Connection[]> {
  const conns: Connection[] = [];
  const getNextPage = async (pageToken = ""): Promise<void> => {
    const res = await client.get<{
      connections: Connection[];
      nextPageToken?: string;
    }>(`/projects/${projectId}/locations/${LOCATION_OVERRIDE ?? location}/connections`, {
      queryParams: {
        pageSize: PAGE_SIZE_MAX,
        pageToken,
      },
    });
    if (Array.isArray(res.body.connections)) {
      conns.push(...res.body.connections);
    }
    if (res.body.nextPageToken) {
      await getNextPage(res.body.nextPageToken);
    }
  };
  await getNextPage();
  return conns;
}

/**
 * Gets a list of repositories that can be added to the provided Connection.
 */
export async function listAllLinkableGitRepositories(
  projectId: string,
  location: string,
  connectionId: string,
): Promise<LinkableGitRepository[]> {
  const name = `projects/${projectId}/locations/${LOCATION_OVERRIDE ?? location}/connections/${connectionId}:fetchLinkableGitRepositories`;
  const repos: LinkableGitRepository[] = [];

  const getNextPage = async (pageToken = ""): Promise<void> => {
    const res = await client.get<LinkableGitRepositories>(name, {
      queryParams: {
        pageSize: PAGE_SIZE_MAX,
        pageToken,
      },
    });

    if (Array.isArray(res.body.linkableGitRepositories)) {
      repos.push(...res.body.linkableGitRepositories);
    }

    if (res.body.nextPageToken) {
      await getNextPage(res.body.nextPageToken);
    }
  };

  await getNextPage();
  return repos;
}

/**
 * Lists all branches for a given repo. Returns a set of branches.
 */
export async function listAllBranches(repoLinkName: string): Promise<Set<string>> {
  const branches = new Set<string>();

  const getNextPage = async (pageToken = ""): Promise<void> => {
    const res = await client.get<{
      refNames: string[];
      nextPageToken?: string;
    }>(`${repoLinkName}:fetchGitRefs`, {
      queryParams: {
        refType: "BRANCH",
        pageSize: PAGE_SIZE_MAX,
        pageToken,
      },
    });
    if (Array.isArray(res.body.refNames)) {
      res.body.refNames.forEach((branch) => {
        branches.add(branch);
      });
    }
    if (res.body.nextPageToken) {
      await getNextPage(res.body.nextPageToken);
    }
  };

  await getNextPage();

  return branches;
}

/**
 * Fetch all GitHub installations available to the oauth token referenced by
 * the given connection
 */
export async function fetchGitHubInstallations(
  projectId: string,
  location: string,
  connectionId: string,
): Promise<Installation[]> {
  const name = `projects/${projectId}/locations/${LOCATION_OVERRIDE ?? location}/connections/${connectionId}:fetchGitHubInstallations`;
  const res = await client.get<{ installations: Installation[] }>(name);

  return res.body.installations;
}

/**
 * Creates a GitRepositoryLink. Upon linking a Git Repository, Developer
 * Connect will configure the Git Repository to send webhook events to
 * Developer Connect.
 */
export async function createGitRepositoryLink(
  projectId: string,
  location: string,
  connectionId: string,
  gitRepositoryLinkId: string,
  cloneUri: string,
): Promise<Operation> {
  const res = await client.post<
    Omit<GitRepositoryLink, GitRepositoryLinkOutputOnlyFields | "name">,
    Operation
  >(
    `projects/${projectId}/locations/${LOCATION_OVERRIDE ?? location}/connections/${connectionId}/gitRepositoryLinks`,
    { cloneUri },
    { queryParams: { gitRepositoryLinkId } },
  );
  return res.body;
}

/**
 * Get details of a single GitRepositoryLink
 */
export async function getGitRepositoryLink(
  projectId: string,
  location: string,
  connectionId: string,
  gitRepositoryLinkId: string,
): Promise<GitRepositoryLink> {
  const name = `projects/${projectId}/locations/${LOCATION_OVERRIDE ?? location}/connections/${connectionId}/gitRepositoryLinks/${gitRepositoryLinkId}`;
  const res = await client.get<GitRepositoryLink>(name);
  return res.body;
}

/**
 * Fetch the read token for a GitRepositoryLink
 */
export async function fetchGitRepositoryLinkReadToken(
  projectId: string,
  location: string,
  connectionId: string,
  gitRepositoryLinkId: string,
): Promise<GitRepositoryLinkReadToken> {
  const name = `projects/${projectId}/locations/${LOCATION_OVERRIDE ?? location}/connections/${connectionId}/gitRepositoryLinks/${gitRepositoryLinkId}:fetchReadToken`;
  const res = await client.post<unknown, GitRepositoryLinkReadToken>(name);
  return res.body;
}

/**
 * sorts the given list of connections by create_time from earliest to latest
 */
export function sortConnectionsByCreateTime(connections: Connection[]) {
  return connections.sort((a, b) => {
    return Date.parse(a.createTime!) - Date.parse(b.createTime!);
  });
}

/**
 * Returns email associated with the Developer Connect Service Agent
 */
export function serviceAgentEmail(projectNumber: string): string {
  return `service-${projectNumber}@${developerConnectP4SADomain()}`;
}

/**
 * Generates the Developer Connect P4SA which is required to use the Developer
 * Connect APIs.
 * @param projectNumber the project number for which this P4SA is being
 * generated for.
 */
export async function generateP4SA(projectNumber: string): Promise<void> {
  const devConnectOrigin = developerConnectOrigin();

  await generateServiceIdentityAndPoll(
    projectNumber,
    new URL(devConnectOrigin).hostname,
    "apphosting",
  );
}

/**
 * Given a DevConnect GitRepositoryLink resource name, extracts the
 * names of the connection and git repository link
 */
export function extractGitRepositoryLinkComponents(path: string): {
  connection: string | null;
  gitRepoLink: string | null;
} {
  const connectionMatch = /connections\/([^\/]+)/.exec(path);
  const repositoryMatch = /gitRepositoryLinks\/([^\/]+)/.exec(path);

  const connection = connectionMatch ? connectionMatch[1] : null;
  const gitRepoLink = repositoryMatch ? repositoryMatch[1] : null;

  return { connection, gitRepoLink };
}

/**
 * Given a GitRepositoryLink resource path, retrieves the GitRepositoryLink resource,
 * owner, repository name, and read token for the Git repository
 */
export async function getRepoDetailsFromBackend(
  projectId: string,
  location: string,
  gitRepoLinkPath: string,
): Promise<GitRepositoryLinkDetails> {
  const { connection, gitRepoLink } = extractGitRepositoryLinkComponents(gitRepoLinkPath);
  if (!connection || !gitRepoLink) {
    throw new FirebaseError(
      `Failed to extract connection or repository resource names from backend repository name.`,
    );
  }
  const repoLink = await getGitRepositoryLink(projectId, location, connection, gitRepoLink);
  const repoSlug = extractRepoSlugFromUri(repoLink.cloneUri);
  const owner = repoSlug?.split("/")[0];
  const repo = repoSlug?.split("/")[1];
  if (!owner || !repo) {
    throw new FirebaseError("Failed to parse owner and repo from git repository link");
  }
  const readToken = await fetchGitRepositoryLinkReadToken(
    projectId,
    location,
    connection,
    gitRepoLink,
  );

  return {
    repoLink,
    owner,
    repo,
    readToken,
  };
}
