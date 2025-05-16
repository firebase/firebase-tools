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

export type Browser = "CHROME";

export interface TestConfig {
  browsers?: Browser[];
}
