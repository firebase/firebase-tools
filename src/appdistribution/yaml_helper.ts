import * as jsYaml from "js-yaml";
import { getErrMsg, FirebaseError } from "../error";
import { TestCase } from "./types";

declare interface YamlStep {
  goal?: string;
  hint?: string;
  successCriteria?: string;
}

const ALLOWED_YAML_STEP_KEYS = new Set(["goal", "hint", "successCriteria"]);

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
    ...(testCase.name && {
      id: extractIdFromResourceName(testCase.name!), // resource name is retured by server
    }),
    ...(testCase.prerequisiteTestCase && {
      prerequisiteTestCaseId: extractIdFromResourceName(testCase.prerequisiteTestCase),
    }),
    steps: testCase.aiInstructions.steps.map((step) => ({
      goal: step.goal,
      ...(step.hint && { hint: step.hint }),
      ...(step.successCriteria && { successCriteria: step.successCriteria }),
    })),
  }));
}

export function toYaml(testCases: TestCase[]): string {
  return jsYaml.safeDump(toYamlTestCases(testCases));
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
            ...(yamlStep.successCriteria && {
              successCriteria: yamlStep.successCriteria,
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
  if (!Array.isArray(parsedYaml)) {
    throw new FirebaseError("YAML file must contain a list of test cases.");
  }
  return fromYamlTestCases(appName, parsedYaml as YamlTestCase[]);
}
