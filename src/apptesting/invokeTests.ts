import { Client } from "../apiv2";
import { appTestingOrigin } from "../api";
import {
  InvokedTestCases,
  InvokeTestCasesRequest,
  TestCaseInvocation,
  TestInvocation,
} from "./types";
import * as operationPoller from "../operation-poller";
import { FirebaseError, getError } from "../error";

const apiClient = new Client({ urlPrefix: appTestingOrigin(), apiVersion: "v1alpha" });

export async function invokeTests(appId: string, startUri: string, testDefs: TestCaseInvocation[]) {
  const appResource = `projects/${appId.split(":")[1]}/apps/${appId}`;
  try {
    const invocationResponse = await apiClient.post<
      InvokeTestCasesRequest,
      operationPoller.LongRunningOperation<TestInvocation>
    >(`${appResource}/testInvocations:invokeTestCases`, buildInvokeTestCasesRequest(testDefs));
    return invocationResponse.body;
  } catch (err: unknown) {
    throw new FirebaseError("Test invocation failed", { original: getError(err) });
  }
}

function buildInvokeTestCasesRequest(
  testCaseInvocations: TestCaseInvocation[],
): InvokeTestCasesRequest {
  return {
    resource: {
      testInvocation: {},
      testCaseInvocations,
    },
  };
}

interface InvocationOperation {
  resource: InvokedTestCases;
}

export async function pollInvocationStatus(
  operationName: string,
  onPoll: (invocation: operationPoller.OperationResult<InvocationOperation>) => void,
  backoff = 30 * 1000,
): Promise<InvocationOperation> {
  return operationPoller.pollOperation<InvocationOperation>({
    pollerName: "App Testing Invocation Poller",
    apiOrigin: appTestingOrigin(),
    apiVersion: "v1alpha",
    operationResourceName: operationName,
    masterTimeout: 30 * 60 * 1000, // 30 minutes
    backoff,
    maxBackoff: 15 * 1000, // 30 seconds
    onPoll,
  });
}
