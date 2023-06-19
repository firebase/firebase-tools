import { Client } from "../../../apiv2";
import { firestackApiOrigin } from "../../../api";

export const API_VERSION = "v1";

const client = new Client({
  urlPrefix: firestackApiOrigin,
  auth: true,
  apiVersion: API_VERSION,
});

export type State = "BUILDING" | "BUILD" | "DEPLOYING" | "READY" | "FAILED";

/** A Stack, the primary resource of Frameworks. */
interface StackBase {
  name: string;
  mode?: string;
  labels: Record<string, string>;
  codebase: Codebase;
}

interface Codebase {
  repository?: string;
  rootDirectory: string;
}

export type OutputStack = StackBase & {
  createTime: string;
  updateTime: string;
  uri: string;
};

interface Build {
  name: string;
  state: State;
  image: string;
  buildLogsUri: string;
}

export type OutputBuild = Build & {
  createTime: Date;
  updateTime: Date;
  sourceRef: string;
};

/**
 * Creates a new Stack in a given project and location.
 */
export async function createStack(
  projectId: string,
  location: string,
  functionId: string
): Promise<OutputStack> {
  const name = `projects/${projectId}/locations/${location}/functions/${functionId}`;
  const res = await client.get<OutputStack>(name);
  return res.body;
}

/**
 * Creates a new Build in a given project and location.
 */
export async function createBuild(
  projectId: string,
  location: string,
  functionId: string
): Promise<OutputStack> {
  const name = `projects/${projectId}/locations/${location}/functions/${functionId}`;
  const res = await client.get<OutputStack>(name);
  return res.body;
}
