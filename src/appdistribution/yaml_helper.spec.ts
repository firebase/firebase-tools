import { TestCase } from "./types";
import * as jsYaml from "js-yaml";
import { fromYaml, toYaml } from "./yaml_helper";
import { expect } from "chai";

const APP_NAME = "projects/12345/apps/1:12345:android:beef";

const TEST_CASE: TestCase = {
  displayName: "test-display-name",
  name: "projects/12345/apps/1:12345:android:beef/testCases/test-case-id",
  prerequisiteTestCase:
    "projects/12345/apps/1:12345:android:beef/testCases/prerequisite-test-case-id",
  aiInstructions: {
    steps: [
      {
        goal: "test-goal",
        hint: "test-hint",
        successCriteria: "test-success-criteria",
      },
    ],
  },
};

const YAML_STRING = `- displayName: test-display-name
  id: test-case-id
  prerequisiteTestCaseId: prerequisite-test-case-id
  steps:
    - goal: test-goal
      hint: test-hint
      successCriteria: test-success-criteria
`;

const YAML_DATA = {
  displayName: "test-display-name",
  id: "test-case-id",
  prerequisiteTestCaseId: "prerequisite-test-case-id",
  steps: [
    {
      goal: "test-goal",
      hint: "test-hint",
      successCriteria: "test-success-criteria",
    },
  ],
};

describe("YamlHelper", () => {
  it("converts TestCase[] to YAML string", () => {
    const yamlString = toYaml([TEST_CASE]);
    expect(yamlString).to.eq(YAML_STRING); // brittle ¯\_(ツ)_/¯
    expect(jsYaml.safeLoad(yamlString)).to.eql([YAML_DATA]);
  });

  it("converts YAML string to TestCase[]", () => {
    const testCases = fromYaml(APP_NAME, YAML_STRING);
    expect(testCases).to.eql([TEST_CASE]);
  });

  it("throws error if displayName is missing", () => {
    expect(() =>
      fromYaml(
        APP_NAME,
        `- steps:
  - goal: test-goal
    hint: test-hint
    successCriteria: test-success-criteria
`,
      ),
    ).to.throw(/"displayName" is required/);
  });

  it("throws error if steps is missing", () => {
    expect(() => fromYaml(APP_NAME, `- displayName: test-display-name`)).to.throw(
      /"steps" is required/,
    );
  });

  it("throws error if goal is missing", () => {
    expect(() =>
      fromYaml(
        APP_NAME,
        `- displayName: test-display-name
  steps:
    - hint: test-hint
      successCriteria: test-success-criteria
`,
      ),
    ).to.throw(/"goal" is required/);
  });

  it("throws error if additional property is present in test case", () => {
    expect(() =>
      fromYaml(
        APP_NAME,
        `- displayName: test-display-name
  extraTestCaseProperty: property
  steps:
    - goal: test-goal
`,
      ),
    ).to.throw(/unexpected property "extraTestCaseProperty"/);
  });

  it("throws error if additional property is present in step", () => {
    expect(() =>
      fromYaml(
        APP_NAME,
        `- displayName: test-display-name
  steps:
    - goal: test-goal
      extraStepProperty: property
`,
      ),
    ).to.throw(/unexpected property "extraStepProperty"/);
  });

  it("throws error if YAML is invalid", () => {
    expect(() => fromYaml(APP_NAME, "this is not YAML")).to.throw();
  });
});
