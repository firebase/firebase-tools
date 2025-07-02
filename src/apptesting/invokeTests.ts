import { Client } from "../apiv2";
import { appTestingOrigin } from "../api";
import { InvokeTestCasesRequest, TestCaseInvocation, TestInvocation } from "./types";
import * as operationPoller from "../operation-poller";
import { FirebaseError } from "../error";

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
    throw new FirebaseError("Test invocation failed");
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

export async function pollInvocationStatus(
  operationName: string,
  onPoll: (invocation: operationPoller.OperationResult<TestInvocation>) => void,
  backoff = 30 * 1000,
): Promise<TestInvocation> {
  return operationPoller.pollOperation<TestInvocation>({
    pollerName: "App Testing Invocation Poller",
    apiOrigin: appTestingOrigin(),
    apiVersion: "v1alpha",
    operationResourceName: operationName,
    masterTimeout: 30 * 60 * 1000, // 30 minutes
    backoff,
    maxBackoff: 30 * 1000, // 30 seconds
    onPoll,
  });
}
