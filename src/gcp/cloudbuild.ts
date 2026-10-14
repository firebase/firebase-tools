import { Client } from "../apiv2";
import { cloudbuildOrigin } from "../api";
import { FirebaseError } from "../error";
import { pollOperation } from "../operation-poller";

const PAGE_SIZE_MAX = 100;

const client = new Client({
  urlPrefix: cloudbuildOrigin(),
  auth: true,
  apiVersion: "v2",
});

// Builds are in Cloud Build's v1 API.
const buildsClient = new Client({
  urlPrefix: cloudbuildOrigin(),
  auth: true,
  apiVersion: "v1",
});

/** A Cloud Build build step. Only the fields the CLI uses. */
export interface BuildStep {
  id?: string;
  name: string;
  entrypoint?: string;
  args?: string[];
  env?: string[];
  secretEnv?: string[];
}

/** A Cloud Build build. Only the fields the CLI uses. */
export interface Build {
  name?: string;
  logUrl?: string;
  status?: string;
  source?: { storageSource: { bucket: string; object: string } };
  steps: BuildStep[];
  images?: string[];
  availableSecrets?: { secretManager: { versionName: string; env: string }[] };
  artifacts?: {
    images?: string[];
    oci?: { file: string; registryPath: string; tags?: string[] }[];
  };
  options?: {
    env?: string[];
    volumes?: { name: string; path: string }[];
    logStreamingOption?: string;
    logging?: string;
    requestedVerifyOption?: string;
  };
  substitutions?: Record<string, string>;
  tags?: string[];
  timeout?: string;
  queueTtl?: string;
}

const PENDING_BUILD_STATUSES = ["STATUS_UNKNOWN", "PENDING", "QUEUED", "WORKING"];

/** Starts a build and returns it. Call waitForBuild to wait for it to finish. */
export async function createBuild(
  projectId: string,
  location: string,
  build: Build,
): Promise<Build & { name: string }> {
  const res = await buildsClient.post<Build, { metadata?: { build?: Build } }>(
    `/projects/${projectId}/locations/${location}/builds`,
    build,
  );
  const created = res.body.metadata?.build;
  if (!created?.name) {
    throw new FirebaseError("Failed to start the build: no build was returned.");
  }
  return { ...created, name: created.name };
}

/** Waits for a build to finish. Throws if it didn't succeed. */
export async function waitForBuild(build: { name: string; logUrl?: string }): Promise<void> {
  // The operation for a regional build can't be polled, so poll the build itself.
  let status: string | undefined;
  await pollOperation({
    apiOrigin: cloudbuildOrigin(),
    apiVersion: "v1",
    operationResourceName: build.name,
    masterTimeout: 30 * 60 * 1000,
    maxBackoff: 10_000,
    doneFn: (b?: { status?: string }) => {
      status = b?.status;
      return !b?.status || !PENDING_BUILD_STATUSES.includes(b.status);
    },
  });
  if (status !== "SUCCESS") {
    throw new FirebaseError(
      `Cloud Build failed with status ${status ?? "UNKNOWN"}. View the build logs at ${build.logUrl ?? ""}`,
    );
  }
}

/**
 * Returns the email of the service account that builds run as by default: the Compute Engine
 * default service account on newer projects, or the legacy Cloud Build service account.
 */
export async function getDefaultBuildServiceAccount(
  projectId: string,
  location: string,
): Promise<string> {
  const res = await buildsClient.get<{ serviceAccountEmail?: string }>(
    `/projects/${projectId}/locations/${location}/defaultServiceAccount`,
  );
  // Formatted as projects/{project}/serviceAccounts/{email}.
  const email = res.body.serviceAccountEmail?.split("/").pop();
  if (!email) {
    throw new FirebaseError(`Cloud Build has no default service account in ${location}.`);
  }
  return email;
}

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
  pageToken = "",
  pageSize = 1000,
): Promise<LinkableRepositories> {
  const name = `projects/${projectId}/locations/${location}/connections/${connectionId}:fetchLinkableRepositories`;
  const res = await client.get<LinkableRepositories>(name, {
    queryParams: {
      pageSize,
      pageToken,
    },
  });
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
 * Returns the service account created by Cloud Build to use as a default in Cloud Build jobs.
 * This service account is deprecated and future users should bring their own account.
 */
export function getDefaultServiceAccount(projectNumber: string): string {
  return `${projectNumber}@cloudbuild.gserviceaccount.com`;
}

/**
 * Returns the default cloud build service agent.
 * This is the account that Cloud Build itself uses when performing operations on the user's behalf.
 */
export function getDefaultServiceAgent(projectNumber: string): string {
  return `service-${projectNumber}@gcp-sa-cloudbuild.iam.gserviceaccount.com`;
}
