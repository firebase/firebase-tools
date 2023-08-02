import { Client } from "../apiv2";
import { frameworksOrigin } from "../api";

export const API_VERSION = "v1alpha";

const client = new Client({
  urlPrefix: frameworksOrigin,
  auth: true,
  apiVersion: API_VERSION,
});

type State = "BUILDING" | "BUILD" | "DEPLOYING" | "READY" | "FAILED";

interface Codebase {
  repository?: string;
  rootDirectory: string;
}

/** A Stack, the primary resource of Frameworks. */
export interface Stack {
  name: string;
  mode?: string;
  codebase: Codebase;
  labels: Record<string, string>;
  createTime: string;
  updateTime: string;
  uri: string;
}

export type StackOutputOnlyFields = "createTime" | "updateTime" | "uri" | "codebase";

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

/**
 * Creates a new Stack in a given project and location.
 */
export async function createStack(
  projectId: string,
  location: string,
  stackInput: Omit<Stack, StackOutputOnlyFields>
): Promise<Operation> {
  const stackId = stackInput.name;
  const res = await client.post<Omit<Stack, StackOutputOnlyFields>, Operation>(
    `projects/${projectId}/locations/${location}/stacks`,
    stackInput,
    { queryParams: { stackId } }
  );

  return res.body;
}

/**
 * Gets stack details.
 */
export async function getStack(
  projectId: string,
  location: string,
  stackId: string
): Promise<Stack> {
  const name = `projects/${projectId}/locations/${location}/stacks/${stackId}`;
  const res = await client.get<Stack>(name);

  return res.body;
}

/**
 * Creates a new Build in a given project and location.
 */
export async function createBuild(
  projectId: string,
  location: string,
  stackId: string,
  buildInput: Omit<Build, BuildOutputOnlyFields>
): Promise<Operation> {
  const buildId = buildInput.name;
  const res = await client.post<Omit<Build, BuildOutputOnlyFields>, Operation>(
    `projects/${projectId}/locations/${location}/stacks/${stackId}/builds`,
    buildInput,
    { queryParams: { buildId } }
  );

  return res.body;
}
