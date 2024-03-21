import { Client } from "../apiv2";
import { developerConnectOrigin, developerConnectP4SAOrigin } from "../api";
import { logBullet } from "../utils";

const PAGE_SIZE_MAX = 1000;
const LOCATION_OVERRIDE = "us-central1"; // TODO(mathusan): for debugging only

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
  repositories: LinkableGitRepository[];
  nextPageToken: string;
}

export interface LinkableGitRepository {
  cloneUri: string;
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
  location = LOCATION_OVERRIDE;
  const res = await client.post<
    Omit<Omit<Connection, "name">, ConnectionOutputOnlyFields>,
    Operation
  >(
    `projects/${projectId}/locations/${location}/connections`,
    {
      githubConfig: config,
    },
    { queryParams: { connectionId } },
  );
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
  location = LOCATION_OVERRIDE;
  const name = `projects/${projectId}/locations/${location}/connections/${connectionId}`;
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
  location = LOCATION_OVERRIDE;
  const getNextPage = async (pageToken = ""): Promise<void> => {
    const res = await client.get<{
      connections: Connection[];
      nextPageToken?: string;
    }>(`/projects/${projectId}/locations/${location}/connections`, {
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
  location = LOCATION_OVERRIDE;
  const name = `projects/${projectId}/locations/${location}/connections/${connectionId}:fetchLinkableGitRepositories`;
  const repos: LinkableGitRepository[] = [];

  const getNextPage = async (pageToken = ""): Promise<void> => {
    logBullet(`page token from here: ${pageToken}`);
    const res = await client.get<LinkableGitRepositories>(name, {
      queryParams: {
        pageSize: PAGE_SIZE_MAX,
        pageToken,
      },
    });

    if (Array.isArray(res.body.repositories)) {
      repos.push(...res.body.repositories);
    }

    if (res.body.nextPageToken) {
      await getNextPage(res.body.nextPageToken);
    }
  };

  await getNextPage();
  return repos;
}

/**
 * Creates a GitRepositoryLink.Upon linking a Git Repository, Developer
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
  location = LOCATION_OVERRIDE;
  const res = await client.post<
    Omit<GitRepositoryLink, GitRepositoryLinkOutputOnlyFields | "name">,
    Operation
  >(
    `projects/${projectId}/locations/${location}/connections/${connectionId}/gitRepositoryLinks`,
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
  location = LOCATION_OVERRIDE;
  const name = `projects/${projectId}/locations/${location}/connections/${connectionId}/gitRepositoryLinks/${gitRepositoryLinkId}`;
  const res = await client.get<GitRepositoryLink>(name);
  return res.body;
}

/**
 * Returns email associated with the Developer Connect Service Agent
 */
export function serviceAgentEmail(projectNumber: string): string {
  return `service-${projectNumber}@${developerConnectP4SAOrigin()}`;
}
