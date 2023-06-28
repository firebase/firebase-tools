import { Client } from "../apiv2";
import { frameworksOrigin } from "../api";

export const API_VERSION = "v1";

const client = new Client({
  urlPrefix: frameworksOrigin,
  auth: true,
  apiVersion: API_VERSION,
});

export type State = "BUILDING" | "BUILD" | "DEPLOYING" | "READY" | "FAILED";

interface Codebase {
  repository?: string;
  rootDirectory: string;
}

/** A Stack, the primary resource of Frameworks. */
interface Stack {
  name: string;
  mode?: string;
  codebase: Codebase;
  labels: Record<string, string>;
  createTime: string;
  updateTime: string;
  uri: string;
}

export type StackOutputOnlyFields = "createTime" | "updateTime" | "uri";

interface Build {
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

export interface OperationMetadata {
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

/**
 * Creates a new Stack in a given project and location.
 */
export async function createStack(
  projectId: string,
  location: string,
  stackId: string,
  stack: Stack
): Promise<Operation> {
  const res = await client.post<Omit<Stack, StackOutputOnlyFields>, Operation>(
    `projects/${projectId}/locations/${location}/stacks`,
    stack,
    { queryParams: { stackId } }
  );
  return res.body;
}

/**
 * Creates a new Build in a given project and location.
 */
export async function createBuild(
  projectId: string,
  location: string,
  stackId: string,
  buildId: string,
  build: Build
): Promise<Operation> {
  const res = await client.post<Omit<Build, BuildOutputOnlyFields>, Operation>(
    `projects/${projectId}/locations/${location}/stacks/${stackId}/builds`,
    build,
    { queryParams: { buildId } }
  );
  return res.body;
}
