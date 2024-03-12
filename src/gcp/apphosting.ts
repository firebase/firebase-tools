import * as proto from "../gcp/proto";
import { Client } from "../apiv2";
import { needProjectId } from "../projectUtils";
import { apphostingOrigin } from "../api";
import { ensure } from "../ensureApiEnabled";
import * as deploymentTool from "../deploymentTool";
import { FirebaseError } from "../error";
import { DeepOmit, RecursiveKeyOf, assertImplements } from "../metaprogramming";

export const API_VERSION = "v1alpha";

export const client = new Client({
  urlPrefix: apphostingOrigin,
  auth: true,
  apiVersion: API_VERSION,
});

type BuildState = "BUILDING" | "BUILD" | "DEPLOYING" | "READY" | "FAILED";

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
  computeServiceAccount?: string;
  appId: string;
}

export type BackendOutputOnlyFields = "name" | "createTime" | "updateTime" | "uri";

assertImplements<BackendOutputOnlyFields, RecursiveKeyOf<Backend>>();

export interface Build {
  name: string;
  state: BuildState;
  error: Status;
  image: string;
  config?: BuildConfig;
  source: BuildSource;
  sourceRef: string;
  buildLogsUri?: string;
  displayName?: string;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
  uuid: string;
  etag: string;
  reconciling: boolean;
  createTime: string;
  updateTime: string;
  deleteTime: string;
}

export interface ListBuildsResponse {
  builds: Build[];
  nextPageToken?: string;
  unreachable?: string[];
}

export type BuildOutputOnlyFields =
  | "state"
  | "error"
  | "image"
  | "sourceRef"
  | "buildLogsUri"
  | "reconciling"
  | "uuid"
  | "etag"
  | "createTime"
  | "updateTime"
  | "deleteTime"
  | "source.codebase.displayName"
  | "source.codebase.hash"
  | "source.codebase.commitMessage"
  | "source.codebase.uri"
  | "source.codebase.commitTime";

assertImplements<BuildOutputOnlyFields, RecursiveKeyOf<Build>>();

export interface BuildConfig {
  minInstances?: number;
  memory?: string;
}

interface BuildSource {
  codebase: CodebaseSource;
}

interface CodebaseSource {
  // oneof reference
  branch?: string;
  commit?: string;
  tag?: string;
  // end oneof reference
  displayName: string;
  hash: string;
  commitMessage: string;
  uri: string;
  commitTime: string;
}

interface Status {
  code: number;
  message: string;
  details: unknown;
}

type RolloutState =
  | "STATE_UNSPECIFIED"
  | "QUEUED"
  | "PENDING_BUILD"
  | "PROGRESSING"
  | "PAUSED"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELLED";

export interface Rollout {
  name: string;
  state: RolloutState;
  paused?: boolean;
  pauseTime: string;
  error?: Error;
  build: string;
  stages?: RolloutStage[];
  displayName?: string;
  createTime: string;
  updateTime: string;
  deleteTime?: string;
  purgeTime?: string;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
  uid: string;
  etag: string;
  reconciling: boolean;
}

export type RolloutOutputOnlyFields =
  | "state"
  | "pauseTime"
  | "createTime"
  | "updateTime"
  | "deleteTime"
  | "purgeTime"
  | "uid"
  | "etag"
  | "reconciling";

assertImplements<RolloutOutputOnlyFields, RecursiveKeyOf<Rollout>>();

export interface ListRolloutsResponse {
  rollouts: Rollout[];
  unreachable: string[];
  nextPageToken?: string;
}

export interface Traffic {
  name: string;
  // oneof traffic_management
  target?: TrafficSet;
  rolloutPolicy?: RolloutPolicy;
  // end oneof traffic_management
  current: TrafficSet;
  reconciling: boolean;
  createTime: string;
  updateTime: string;
  annotations?: Record<string, string>;
  etag: string;
  uid: string;
}

export type TrafficOutputOnlyFields =
  | "current"
  | "reconciling"
  | "createTime"
  | "updateTime"
  | "etag"
  | "uid"
  | "rolloutPolicy.disabledTime"
  | "rolloutPolicy.stages.startTime"
  | "rolloutPolicy.stages.endTime";

assertImplements<TrafficOutputOnlyFields, RecursiveKeyOf<Traffic>>();

export interface TrafficSet {
  splits: TrafficSplit[];
}

export interface TrafficSplit {
  build: string;
  percent: number;
}

export interface RolloutPolicy {
  // oneof trigger
  codebaseBranch?: string;
  codebaseTagPattern?: string;
  // end oneof trigger
  stages?: RolloutStage[];
  disabled?: boolean;

  // TODO: This will be undefined if disabled is not true, right?
  disabledTime: string;
}

export type RolloutProgression =
  | "PROGRESSION_UNSPECIFIED"
  | "IMMEDIATE"
  | "LINEAR"
  | "EXPONENTIAL"
  | "PAUSE";

export interface RolloutStage {
  progression: RolloutProgression;
  duration?: {
    seconds: number;
    nanos: number;
  };
  targetPercent?: number;
  startTime: string;
  endTime: string;
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
  backendReqBoby: DeepOmit<Backend, BackendOutputOnlyFields>,
  backendId: string,
): Promise<Operation> {
  const res = await client.post<DeepOmit<Backend, BackendOutputOnlyFields>, Operation>(
    `projects/${projectId}/locations/${location}/backends`,
    {
      ...backendReqBoby,
      labels: {
        ...backendReqBoby.labels,
        ...deploymentTool.labels(),
      },
    },
    { queryParams: { backendId } },
  );

  return res.body;
}

/**
 * Gets backend details.
 */
export async function getBackend(
  projectId: string,
  location: string,
  backendId: string,
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
  location: string,
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
  backendId: string,
): Promise<Operation> {
  const name = `projects/${projectId}/locations/${location}/backends/${backendId}`;
  const res = await client.delete<Operation>(name, { queryParams: { force: "true" } });

  return res.body;
}

/**
 * Get a Build by Id
 */
export async function getBuild(
  projectId: string,
  location: string,
  backendId: string,
  buildId: string,
): Promise<Build> {
  const name = `projects/${projectId}/locations/${location}/backends/${backendId}/builds/${buildId}`;
  const res = await client.get<Build>(name);
  return res.body;
}

/**
 * List Builds by backend
 */
export async function listBuilds(
  projectId: string,
  location: string,
  backendId: string,
): Promise<ListBuildsResponse> {
  const name = `projects/${projectId}/locations/${location}/backends/${backendId}/builds`;
  let pageToken: string | undefined;
  const res: ListBuildsResponse = {
    builds: [],
    unreachable: [],
  };

  do {
    const queryParams: Record<string, string> = pageToken ? { pageToken } : {};
    const int = await client.get<ListBuildsResponse>(name, { queryParams });
    res.builds.push(...(int.body.builds || []));
    res.unreachable?.push(...(int.body.unreachable || []));
    pageToken = int.body.nextPageToken;
  } while (pageToken);

  res.unreachable = [...new Set(res.unreachable)];
  return res;
}

/**
 * Creates a new Build in a given project and location.
 */
export async function createBuild(
  projectId: string,
  location: string,
  backendId: string,
  buildId: string,
  buildInput: DeepOmit<Build, BuildOutputOnlyFields | "name">,
): Promise<Operation> {
  const res = await client.post<DeepOmit<Build, BuildOutputOnlyFields | "name">, Operation>(
    `projects/${projectId}/locations/${location}/backends/${backendId}/builds`,
    {
      ...buildInput,
      labels: {
        ...buildInput.labels,
        ...deploymentTool.labels(),
      },
    },
    { queryParams: { buildId } },
  );
  return res.body;
}

/**
 * Create a new rollout for a backend.
 */
export async function createRollout(
  projectId: string,
  location: string,
  backendId: string,
  rolloutId: string,
  rollout: DeepOmit<Rollout, RolloutOutputOnlyFields | "name">,
  validateOnly = false,
): Promise<Operation> {
  const res = await client.post<DeepOmit<Rollout, RolloutOutputOnlyFields | "name">, Operation>(
    `projects/${projectId}/locations/${location}/backends/${backendId}/rollouts`,
    {
      ...rollout,
      labels: {
        ...rollout.labels,
        ...deploymentTool.labels(),
      },
    },
    { queryParams: { rolloutId, validateOnly: validateOnly ? "true" : "false" } },
  );
  return res.body;
}

/**
 * List all rollouts for a backend.
 */
export async function listRollouts(
  projectId: string,
  location: string,
  backendId: string,
): Promise<ListRolloutsResponse> {
  const name = `projects/${projectId}/locations/${location}/backends/${backendId}/rollouts`;
  let pageToken: string | undefined = undefined;
  const res: ListRolloutsResponse = {
    rollouts: [],
    unreachable: [],
  };

  do {
    const queryParams: Record<string, string> = pageToken ? { pageToken } : {};
    const int = await client.get<ListRolloutsResponse>(name, { queryParams });
    res.rollouts.splice(res.rollouts.length, 0, ...(int.body.rollouts || []));
    res.unreachable.splice(res.unreachable.length, 0, ...(int.body.unreachable || []));
    pageToken = int.body.nextPageToken;
  } while (pageToken);

  res.unreachable = [...new Set(res.unreachable)];
  return res;
}

/**
 * Update traffic of a backend.
 */
export async function updateTraffic(
  projectId: string,
  location: string,
  backendId: string,
  traffic: DeepOmit<Traffic, TrafficOutputOnlyFields | "name">,
): Promise<Operation> {
  // BUG(b/322891558): setting deep fields on rolloutPolicy doesn't work for some
  // reason. Prevent recursion into that field.
  const fieldMasks = proto.fieldMasks(traffic, "rolloutPolicy");
  const queryParams = {
    updateMask: fieldMasks.join(","),
  };
  const name = `projects/${projectId}/locations/${location}/backends/${backendId}/traffic`;
  const res = await client.patch<DeepOmit<Traffic, TrafficOutputOnlyFields>, Operation>(
    name,
    { ...traffic, name },
    {
      queryParams,
    },
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
  let pageToken: string | undefined = undefined;
  let locations: Location[] = [];
  do {
    const queryParams: Record<string, string> = pageToken ? { pageToken } : {};
    const response = await client.get<ListLocationsResponse>(`projects/${projectId}/locations`, {
      queryParams,
    });
    if (response.body.locations && response.body.locations.length > 0) {
      locations = locations.concat(response.body.locations);
    }
    pageToken = response.body.nextPageToken;
  } while (pageToken);
  return locations;
}

/**
 * Ensure that the App Hosting API is enabled on the project.
 */
export async function ensureApiEnabled(options: any): Promise<void> {
  const projectId = needProjectId(options);
  return await ensure(projectId, apphostingOrigin, "app hosting", true);
}

/**
 * Generates the next build ID to fit with the naming scheme of the backend API.
 * @param counter Overrides the counter to use, avoiding an API call.
 */
export async function getNextRolloutId(
  projectId: string,
  location: string,
  backendId: string,
  counter?: number,
): Promise<string> {
  const date = new Date();
  const year = date.getUTCFullYear();
  // Note: month is 0 based in JS
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");

  if (counter) {
    return `build-${year}-${month}-${day}-${String(counter).padStart(3, "0")}`;
  }

  // Note: must use exports here so that listRollouts can be stubbed in tests.
  const rolloutsPromise = (exports as { listRollouts: typeof listRollouts }).listRollouts(
    projectId,
    location,
    backendId,
  );
  const buildsPromise = (exports as { listBuilds: typeof listBuilds }).listBuilds(
    projectId,
    location,
    backendId,
  );
  const [rollouts, builds] = await Promise.all([rolloutsPromise, buildsPromise]);

  if (builds.unreachable?.includes(location) || rollouts.unreachable?.includes(location)) {
    throw new FirebaseError(
      `Firebase App Hosting is currently unreachable in location ${location}`,
    );
  }

  const test = new RegExp(
    `projects/${projectId}/locations/${location}/backends/${backendId}/(rollouts|builds)/build-${year}-${month}-${day}-(\\d+)`,
  );
  const highestId = (input: Array<{ name: string }>): number => {
    let highest = 0;
    for (const i of input) {
      const match = i.name.match(test);
      if (!match) {
        continue;
      }
      const n = Number(match[2]);
      if (n > highest) {
        highest = n;
      }
    }
    return highest;
  };
  const highest = Math.max(highestId(builds.builds), highestId(rollouts.rollouts));
  return `build-${year}-${month}-${day}-${String(highest + 1).padStart(3, "0")}`;
}
