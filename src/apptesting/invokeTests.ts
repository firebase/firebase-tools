import { Client } from "../apiv2"
import { appTestingOrigin } from "../api";
import { Browser, ExecutionConfig, InvokeTestCasesRequest, TestDef, TestExecution } from "./types";

const apiClient = new Client({ urlPrefix: appTestingOrigin(), apiVersion: "v1alpha" });

export async function executeTests(appId: string, startUri: string, testDefs: TestDef[]) {
  // Gets app name from appId
  const appResource = `projects/${appId.split(":")[1]}/apps/${appId}`;
  await apiClient.post<InvokeTestCasesRequest, { name: string }>(
    `${appResource}/testInvocations:invokeTestCases`,
    buildInvokeTestCasesRequest(startUri, testDefs)
  );
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
