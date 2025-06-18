export interface TestStep {
  goal: string;
  successCriteria?: string;
  hint?: string;
}

export interface TestDef {
  id: string;
  testName: string;
  steps: TestStep[];
  testConfig?: TestConfig;
}

export enum Browser {
  BROWSER_UNSPECIFIED,
  CHROME,
}

export interface TestConfig {
  browsers?: Browser[];
}

export interface InvokedTestCases {
  testInvocation: {
    name?: string;
  };
  testCaseInvocations: TestCaseInvocation[];
}

export interface TestInvocation {
  name?: string;
  createTime?: string;
  runningExecutions: number;
  succeededExecutions: number;
  failedExecutions: number;
}

export interface TestCaseInvocation {
  name?: string;
  testCase: TestCase;
  testExecution: TestExecution[];
}

export interface TestExecution {
  config: ExecutionConfig;
  result?: TestExecutionResult;
}

export interface ExecutionConfig {
  browser: Browser;
}

export enum CompletionReason {
  COMPLETION_REASON_UNSPECIFIED,
  MAX_STEPS_REACHED,
  GOAL_FAILED,
  NO_ACTIONS_REQUIRED,
  GOAL_INCONCLUSIVE,
  TEST_CANCELLED,
  GOAL_SUCCEEDED,
}

export interface TestExecutionResult {
  completionReason: CompletionReason;
}

export interface TestCase {
  startUri: string;
  instructions: AiInstructions;
}

export interface AiInstructions {
  steps: TestStep[];
}

export interface InvokeTestCasesRequest {
  resource: InvokedTestCases;
}
