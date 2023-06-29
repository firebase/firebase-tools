import { Client } from "../apiv2";
import { frameworksOrigin } from "../api";
import {
  BuildOutputOnlyFields,
  Operation,
  Stack,
  Build,
  StackOutputOnlyFields,
} from "../frameworks/compose/api/interfaces";

export const API_VERSION = "v2";

const client = new Client({
  urlPrefix: frameworksOrigin,
  auth: true,
  apiVersion: API_VERSION,
});

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
