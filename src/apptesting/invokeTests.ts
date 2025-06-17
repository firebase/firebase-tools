import { Client } from "../apiv2"
import { appTestingOrigin } from "../api";
import { Browser, ExecutionConfig, InvokeTestCasesRequest, TestDef, TestExecution, TestInvocation } from "./types";
import * as operationPoller from "../operation-poller";

const apiClient = new Client({ urlPrefix: appTestingOrigin(), apiVersion: "v1alpha" });

export async function executeTests(appId: string, startUri: string, testDefs: TestDef[]) {
  // Gets app name from appId
  const appResource = `projects/${appId.split(":")[1]}/apps/${appId}`;
  const invocationResponse = await apiClient.post<InvokeTestCasesRequest, operationPoller.LongRunningOperation<TestInvocation>>(
    `${appResource}/testInvocations:invokeTestCases`,
    buildInvokeTestCasesRequest(startUri, testDefs)
  );
  return invocationResponse.body
}

function buildInvokeTestCasesRequest(startUri: string, testDefs: TestDef[]): InvokeTestCasesRequest {
  return {
    resource: {
      testInvocation: {},
      testCaseInvocations: testDefs.map((testDef) => {
        const executionConfigs: ExecutionConfig[] = testDef.testConfig?.browsers?.map((browser) => ({ browser })) || [{ browser: Browser.CHROME }];
        const testExecution: TestExecution[] = executionConfigs.map(config => ({ config }));
        return {
          testExecution,
          testCase: {
            startUri,
            instructions: { steps: testDef.steps },
          }
        }
      })
    }
  };
}

export async function pollInvocationStatus(
  operationName: string,
  onPoll: (invocation: operationPoller.OperationResult<TestInvocation>) => void
): Promise<TestInvocation> {
  return operationPoller.pollOperation<TestInvocation>({
    pollerName: "App Testing Invocation Poller",
    apiOrigin: appTestingOrigin(),
    apiVersion: "v1alpha",
    operationResourceName: operationName,
    masterTimeout: 30 * 60 * 1000,  // 30 minutes
    backoff: 30 * 1000,  // 30 seconds
    maxBackoff: 30 * 1000,  // 30 seconds
    onPoll,
  });
}
