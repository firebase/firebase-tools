import { Client } from "../apiv2";
import { cloudbuildOrigin } from "../api";

const PAGE_SIZE_MAX = 100;

const client = new Client({
  urlPrefix: cloudbuildOrigin,
  auth: true,
  apiVersion: "v2",
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

export interface GitHubConfig {
  authorizerCredential?: {
    oauthTokenSecretVersion: string;
    username: string;
  };
  appInstallationId?: string;
}

type InstallationStage =
  | "STAGE_UNSPECIFIED"
  | "PENDING_CREATE_APP"
  | "PENDING_USER_OAUTH"
  | "PENDING_INSTALL_APP"
  | "COMPLETE";

type ConnectionOutputOnlyFields = "createTime" | "updateTime" | "installationState" | "reconciling";

export interface Connection {
  name: string;
  disabled?: boolean;
  annotations?: {
    [key: string]: string;
  };
  etag?: string;
  githubConfig?: GitHubConfig;
  createTime: string;
  updateTime: string;
  installationState: {
    stage: InstallationStage;
    message: string;
    actionUri: string;
  };
  reconciling: boolean;
}

type RepositoryOutputOnlyFields = "createTime" | "updateTime";

export interface Repository {
  name: string;
  remoteUri: string;
  annotations?: {
    [key: string]: string;
  };
  etag?: string;
  createTime: string;
  updateTime: string;
}

interface LinkableRepositories {
  repositories: Repository[];
  nextPageToken: string;
}

/**
 * Creates a Cloud Build V2 Connection.
 */
export async function createConnection(
  projectId: string,
  location: string,
  connectionId: string,
  githubConfig: GitHubConfig = {},
): Promise<Operation> {
  const res = await client.post<
    Omit<Omit<Connection, "name">, ConnectionOutputOnlyFields>,
    Operation
  >(
    `projects/${projectId}/locations/${location}/connections`,
    { githubConfig },
    { queryParams: { connectionId } },
  );
  return res.body;
}

/**
 * Gets metadata for a Cloud Build V2 Connection.
 */
export async function getConnection(
  projectId: string,
  location: string,
  connectionId: string,
): Promise<Connection> {
  const name = `projects/${projectId}/locations/${location}/connections/${connectionId}`;
  const res = await client.get<Connection>(name);
  return res.body;
}

/**
 * List metadata for a Cloud Build V2 Connection.
 */
export async function listConnections(projectId: string, location: string): Promise<Connection[]> {
  const conns: Connection[] = [];
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
 * Deletes a Cloud Build V2 Connection.
 */
export async function deleteConnection(
  projectId: string,
  location: string,
  connectionId: string,
): Promise<Operation> {
  const name = `projects/${projectId}/locations/${location}/connections/${connectionId}`;
  const res = await client.delete<Operation>(name);
  return res.body;
}

/**
 * Gets a list of repositories that can be added to the provided Connection.
 */
export async function fetchLinkableRepositories(
  projectId: string,
  location: string,
  connectionId: string,
): Promise<LinkableRepositories> {
  const name = `projects/${projectId}/locations/${location}/connections/${connectionId}:fetchLinkableRepositories`;
  const res = await client.get<LinkableRepositories>(name);
  return res.body;
}

/**
 * Creates a Cloud Build V2 Repository.
 */
export async function createRepository(
  projectId: string,
  location: string,
  connectionId: string,
  repositoryId: string,
  remoteUri: string,
): Promise<Operation> {
  const res = await client.post<Omit<Repository, RepositoryOutputOnlyFields | "name">, Operation>(
    `projects/${projectId}/locations/${location}/connections/${connectionId}/repositories`,
    { remoteUri },
    { queryParams: { repositoryId } },
  );
  return res.body;
}

/**
 * Gets metadata for a Cloud Build V2 Repository.
 */
export async function getRepository(
  projectId: string,
  location: string,
  connectionId: string,
  repositoryId: string,
): Promise<Repository> {
  const name = `projects/${projectId}/locations/${location}/connections/${connectionId}/repositories/${repositoryId}`;
  const res = await client.get<Repository>(name);
  return res.body;
}

/**
 * Deletes a Cloud Build V2 Repository.
 */
export async function deleteRepository(
  projectId: string,
  location: string,
  connectionId: string,
  repositoryId: string,
) {
  const name = `projects/${projectId}/locations/${location}/connections/${connectionId}/repositories/${repositoryId}`;
  const res = await client.delete<Operation>(name);
  return res.body;
}

/**
 * Returns email associated with the Cloud Build Service Agent.
 */
export function serviceAgentEmail(projectNumber: string): string {
  return `service-${projectNumber}@gcp-sa-cloudbuild.iam.gserviceaccount.com`;
}
