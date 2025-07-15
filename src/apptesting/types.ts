export interface TestStep {
  goal: string;
  successCriteria?: string;
  hint?: string;
}

export enum Browser {
  BROWSER_UNSPECIFIED = "BROWSER_UNSPECIFIED",
  CHROME = "CHROME",
}

export interface InvokedTestCases {
  testInvocation: TestInvocation;
  testCaseInvocations: TestCaseInvocation[];
}

export interface ExecutionMetadata {
  runningExecutions?: number;
  succeededExecutions?: number;
  failedExecutions?: number;
  totalExecutions?: number;
  cancelledExecutions?: number;
}

export interface TestInvocation extends ExecutionMetadata {
  name?: string;
  createTime?: string;
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
  displayName: string;
  instructions: Instructions;
}

export interface Instructions {
  steps: TestStep[];
}

export interface InvokeTestCasesRequest {
  resource: InvokedTestCases;
}
