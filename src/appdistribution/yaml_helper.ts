import * as jsYaml from "js-yaml";
import { getErrMsg, FirebaseError } from "../error";
import { TestCase } from "./types";

declare interface YamlStep {
  goal?: string;
  hint?: string;
  finalScreenAssertion?: string;
}

const ALLOWED_YAML_STEP_KEYS = new Set(["goal", "hint", "finalScreenAssertion"]);

declare interface YamlTestCase {
  displayName?: string;
  id?: string;
  prerequisiteTestCaseId?: string;
  steps?: YamlStep[];
}

const ALLOWED_YAML_TEST_CASE_KEYS = new Set([
  "displayName",
  "id",
  "prerequisiteTestCaseId",
  "steps",
]);

function extractIdFromResourceName(name: string): string {
  return name.split("/").pop() ?? "";
}

function toYamlTestCases(testCases: TestCase[]): YamlTestCase[] {
  return testCases.map((testCase) => ({
    displayName: testCase.displayName,
    id: extractIdFromResourceName(testCase.name!), // resource name is retured by server
    ...(testCase.prerequisiteTestCase && {
      prerequisiteTestCaseId: extractIdFromResourceName(testCase.prerequisiteTestCase),
    }),
    steps: testCase.aiInstructions.steps.map((step) => ({
      goal: step.goal,
      ...(step.hint && { hint: step.hint }),
      ...(step.finalScreenAssertion && {
        finalScreenAssertion: step.finalScreenAssertion,
      }),
    })),
  }));
}

export function toYaml(testCases: TestCase[]): string {
  return jsYaml.safeDump({ tests: toYamlTestCases(testCases) });
}

function castExists<T>(it: T | null | undefined, thing: string): T {
  if (it == null) {
    throw new FirebaseError(`"${thing}" is required`);
  }
  return it!;
}

function checkAllowedKeys(allowedKeys: Set<string>, o: object) {
  for (const key of Object.keys(o)) {
    if (!allowedKeys.has(key)) {
      throw new FirebaseError(`unexpected property "${key}"`);
    }
  }
}

function fromYamlTestCases(appName: string, yamlTestCases: YamlTestCase[]): TestCase[] {
  return yamlTestCases.map((yamlTestCase) => {
    checkAllowedKeys(ALLOWED_YAML_TEST_CASE_KEYS, yamlTestCase);
    return {
      displayName: castExists(yamlTestCase.displayName, "displayName"),
      aiInstructions: {
        steps: castExists(yamlTestCase.steps, "steps").map((yamlStep) => {
          checkAllowedKeys(ALLOWED_YAML_STEP_KEYS, yamlStep);
          return {
            goal: castExists(yamlStep.goal, "goal"),
            ...(yamlStep.hint && { hint: yamlStep.hint }),
            ...(yamlStep.finalScreenAssertion && {
              finalScreenAssertion: yamlStep.finalScreenAssertion,
            }),
          };
        }),
      },
      ...(yamlTestCase.id && {
        name: `${appName}/testCases/${yamlTestCase.id}`,
      }),
      ...(yamlTestCase.prerequisiteTestCaseId && {
        prerequisiteTestCase: `${appName}/testCases/${yamlTestCase.prerequisiteTestCaseId}`,
      }),
    };
  });
}

export function fromYaml(appName: string, yaml: string): TestCase[] {
  let parsedYaml: unknown;
  try {
    parsedYaml = jsYaml.safeLoad(yaml);
  } catch (err: unknown) {
    throw new FirebaseError(`Failed to parse YAML: ${getErrMsg(err)}`);
  }
  if (!parsedYaml || typeof parsedYaml !== "object" || !("tests" in parsedYaml)) {
    throw new FirebaseError(
      "YAML file must contain a top-level 'tests' field with a list of test cases.",
    );
  }
  const yamlTestCases = (parsedYaml as any).tests;
  if (!Array.isArray(yamlTestCases)) {
    throw new FirebaseError(
      "The 'tests' field in the YAML file must contain a list of test cases.",
    );
  }
  return fromYamlTestCases(appName, yamlTestCases as YamlTestCase[]);
}
