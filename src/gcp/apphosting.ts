import { Client } from "../apiv2";
import { needProjectId } from "../projectUtils";
import { apphostingOrigin } from "../api";
import { ensure } from "../ensureApiEnabled";

export const API_HOST = new URL(apphostingOrigin).host;
export const API_VERSION = "v1alpha";

const client = new Client({
  urlPrefix: apphostingOrigin,
  auth: true,
  apiVersion: API_VERSION,
});

type State = "BUILDING" | "BUILD" | "DEPLOYING" | "READY" | "FAILED";

interface Codebase {
  repository?: string;
  rootDirectory: string;
}

/**
 * Specifies how Backend's data is replicated and served.
 *   GLOBAL_ACCESS: Stores and serves content from multiple points-of-presence (POP)
 *   REGIONAL_STRICT: Restricts data and serving infrastructure in Backend's region
 *
 */
export type ServingLocality = "GLOBAL_ACCESS" | "REGIONAL_STRICT";

/** A Backend, the primary resource of Frameworks. */
export interface Backend {
  name: string;
  mode?: string;
  codebase: Codebase;
  servingLocality: ServingLocality;
  labels: Record<string, string>;
  createTime: string;
  updateTime: string;
  uri: string;
}

export type BackendOutputOnlyFields = "name" | "createTime" | "updateTime" | "uri";

export interface Build {
  name: string;
  state: State;
  error: Status;
  image: string;
  source: BuildSource;
  buildLogsUri: string;
  createTime: Date;
  updateTime: Date;
  sourceRef: string;
}

export type BuildOutputOnlyFields = "createTime" | "updateTime" | "sourceRef";

interface BuildSource {
  codeBaseSource?: CodebaseSource;
}

interface Status {
  code: number;
  message: string;
  details: any[];
}

interface CodebaseSource {
  // oneof reference
  branch: string;
  commit: string;
  tag: string;
  // end oneof reference
}

interface OperationMetadata {
  createTime: string;
  endTime: string;
  target: string;
  verb: string;
  statusDetail: string;
  cancelRequested: boolean;
  apiVersion: string;
}

export interface Operation {
  name: string;
  metadata?: OperationMetadata;
  done: boolean;
  // oneof result
  error?: Status;
  response?: any;
  // end oneof result
}

export interface ListBackendsResponse {
  backends: Backend[];
}

/**
 * Creates a new Backend in a given project and location.
 */
export async function createBackend(
  projectId: string,
  location: string,
  backendReqBoby: Omit<Backend, BackendOutputOnlyFields>,
  backendId: string
): Promise<Operation> {
  const res = await client.post<Omit<Backend, BackendOutputOnlyFields>, Operation>(
    `projects/${projectId}/locations/${location}/backends`,
    backendReqBoby,
    { queryParams: { backendId } }
  );

  return res.body;
}

/**
 * Gets backend details.
 */
export async function getBackend(
  projectId: string,
  location: string,
  backendId: string
): Promise<Backend> {
  const name = `projects/${projectId}/locations/${location}/backends/${backendId}`;
  const res = await client.get<Backend>(name);
  return res.body;
}

/**
 * List all backends present in a project and region.
 */
export async function listBackends(
  projectId: string,
  location: string
): Promise<ListBackendsResponse> {
  const name = `projects/${projectId}/locations/${location}/backends`;
  const res = await client.get<ListBackendsResponse>(name);

  return res.body;
}

/**
 * Deletes a backend with backendId in a given project and location.
 */
export async function deleteBackend(
  projectId: string,
  location: string,
  backendId: string
): Promise<Operation> {
  const name = `projects/${projectId}/locations/${location}/backends/${backendId}`;
  const res = await client.delete<Operation>(name);

  return res.body;
}

/**
 * Creates a new Build in a given project and location.
 */
export async function createBuild(
  projectId: string,
  location: string,
  backendId: string,
  buildInput: Omit<Build, BuildOutputOnlyFields>
): Promise<Operation> {
  const buildId = buildInput.name;
  const res = await client.post<Omit<Build, BuildOutputOnlyFields>, Operation>(
    `projects/${projectId}/locations/${location}/backends/${backendId}/builds`,
    buildInput,
    { queryParams: { buildId } }
  );

  return res.body;
}

export interface Location {
  name: string;
  locationId: string;
}

interface ListLocationsResponse {
  locations: Location[];
  nextPageToken?: string;
}

/**
 * Lists information about the supported locations.
 */
export async function listLocations(projectId: string): Promise<Location[]> {
  let pageToken;
  let locations: Location[] = [];
  do {
    const response = await client.get<ListLocationsResponse>(`projects/${projectId}/locations`);
    if (response.body.locations && response.body.locations.length > 0) {
      locations = locations.concat(response.body.locations);
    }
    pageToken = response.body.nextPageToken;
  } while (pageToken);
  return locations;
}

/**
 * Ensure that Frameworks API is enabled on the project.
 */
export async function ensureApiEnabled(options: any): Promise<void> {
  const projectId = needProjectId(options);
  return await ensure(projectId, API_HOST, "frameworks", true);
}
