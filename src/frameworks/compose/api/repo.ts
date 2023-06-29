import { Stack, StackOutputOnlyFields } from "./interfaces";
import * as poller from "../../../operation-poller";
import { frameworksOrigin } from "../../../api";
import * as gcp from "../../../gcp/frameworks";
import { API_VERSION } from "../../../gcp/frameworks";

const frameworksPollerOptions: Omit<poller.OperationPollerOptions, "operationResourceName"> = {
  apiOrigin: frameworksOrigin,
  apiVersion: API_VERSION,
  masterTimeout: 25 * 60 * 1_000,
  maxBackoff: 10_000,
};

/**
 * Creates Stack object from long running operations.
 */
export async function createStack(
  projectId: string,
  location: string,
  stackInput: Omit<Stack, StackOutputOnlyFields>
): Promise<Stack> {
  const op = await gcp.createStack(projectId, location, stackInput);
  const stack = await poller.pollOperation<Stack>({
    ...frameworksPollerOptions,
    pollerName: `create-${projectId}-${location}-${stackInput.name}`,
    operationResourceName: op.name,
  });

  return stack;
}
