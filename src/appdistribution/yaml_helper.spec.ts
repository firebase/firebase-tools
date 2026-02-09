import * as jsYaml from "js-yaml";
import { TestCase } from "./types";
import { fromYaml, toYaml } from "./yaml_helper";
import { expect } from "chai";

const APP_NAME = "projects/12345/apps/1:12345:android:beef";

const TEST_CASES: TestCase[] = [
  {
    displayName: "test-display-name",
    name: "projects/12345/apps/1:12345:android:beef/testCases/test-case-id",
    prerequisiteTestCase:
      "projects/12345/apps/1:12345:android:beef/testCases/prerequisite-test-case-id",
    aiInstructions: {
      steps: [
        {
          goal: "test-goal",
          hint: "test-hint",
          finalScreenAssertion: "test-final-screen-assertion",
        },
      ],
    },
  },
  {
    displayName: "minimal-case",
    name: "projects/12345/apps/1:12345:android:beef/testCases/minimal-id",
    aiInstructions: { steps: [{ goal: "win" }] },
  },
];

const YAML_STRING = `tests:
  - displayName: test-display-name
    id: test-case-id
    prerequisiteTestCaseId: prerequisite-test-case-id
    steps:
      - goal: test-goal
        hint: test-hint
        finalScreenAssertion: test-final-screen-assertion
  - displayName: minimal-case
    id: minimal-id
    steps:
      - goal: win
`;

const YAML_DATA = {
  tests: [
    {
      displayName: "test-display-name",
      id: "test-case-id",
      prerequisiteTestCaseId: "prerequisite-test-case-id",
      steps: [
        {
          goal: "test-goal",
          hint: "test-hint",
          finalScreenAssertion: "test-final-screen-assertion",
        },
      ],
    },
    {
      displayName: "minimal-case",
      id: "minimal-id",
      steps: [{ goal: "win" }],
    },
  ],
};

describe("YamlHelper", () => {
  it("converts TestCase[] to YAML string", () => {
    const yamlString = toYaml(TEST_CASES);
    expect(jsYaml.safeLoad(yamlString)).to.eql(YAML_DATA);
    expect(yamlString).to.eq(YAML_STRING); // brittle ¯\_(ツ)_/¯
  });

  it("converts YAML string to TestCase[]", () => {
    const testCases = fromYaml(APP_NAME, YAML_STRING);
    expect(testCases).to.eql(TEST_CASES);
  });

  it("converts YAML without ID", () => {
    const testCases = fromYaml(
      APP_NAME,
      `tests:
  - displayName: minimal-case
    steps:
      - goal: win
`,
    );
    expect(testCases).to.eql([
      {
        displayName: "minimal-case",
        aiInstructions: { steps: [{ goal: "win" }] },
      },
    ]);
  });

  it("throws error if displayName is missing", () => {
    expect(() =>
      fromYaml(
        APP_NAME,
        `tests:
  - steps:
      - goal: test-goal
        hint: test-hint
        finalScreenAssertion: test-final-screen-assertion
`,
      ),
    ).to.throw(/"displayName" is required/);
  });

  it("throws error if steps is missing", () => {
    expect(() =>
      fromYaml(
        APP_NAME,
        `tests:
  - displayName: test-display-name`,
      ),
    ).to.throw(/"steps" is required/);
  });

  it("throws error if goal is missing", () => {
    expect(() =>
      fromYaml(
        APP_NAME,
        `tests:
  - displayName: test-display-name
    steps:
      - hint: test-hint
        finalScreenAssertion: test-final-screen-assertion
`,
      ),
    ).to.throw(/"goal" is required/);
  });

  it("throws error if additional property is present in test case", () => {
    expect(() =>
      fromYaml(
        APP_NAME,
        `tests:
  - displayName: test-display-name
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
        `tests:
  - displayName: test-display-name
    steps:
      - goal: test-goal
        extraStepProperty: property
`,
      ),
    ).to.throw(/unexpected property "extraStepProperty"/);
  });

  it("throws error if YAML is invalid", () => {
    expect(() =>
      fromYaml(
        APP_NAME,
        `tests:
  -
  invalid key: value`,
      ),
    ).to.throw(/at line 3/);
  });

  it("throws error if YAML doesn't contain a top-level tests field", () => {
    expect(() => fromYaml(APP_NAME, "not a list")).to.throw(
      /YAML file must contain a top-level 'tests' field with a list of test cases/,
    );
  });

  it("throws error if top-level 'tests' field is not an array", () => {
    expect(() => fromYaml(APP_NAME, `tests: "not an array"`)).to.throw(
      /The 'tests' field in the YAML file must contain a list of test cases/,
    );
  });
});
