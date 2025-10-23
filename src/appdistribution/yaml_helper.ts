import { TestCase } from "./types";

interface YamlStep {
  goal?: string;
  hint?: string;
  successCriteria?: string;
}

interface YamlTestCase {
  displayName?: string;
  id?: string;
  prerequisiteTestCaseId?: string;
  steps?: YamlStep[];
}

function extractIdFromResourceName(name: string): string {
  return name.split('/').pop() ?? '';
}

function toYamlTestCases(testCases: TestCase[]): YamlTestCase[] {
  return testCases.map((testCase) => ({
    displayName: testCase.displayName ?? '',
    id: extractIdFromResourceName(testCase.name!),
    ...(testCase.prerequisiteTestCase && {
      prerequisiteTestCaseId: extractIdFromResourceName(
        testCase.prerequisiteTestCase,
      ),
    }),
    steps: testCase.aiInstructions.steps.map((step) => ({
      goal: step.goal,
      ...(step.hint && {hint: step.hint}),
      ...(step.successCriteria && {successCriteria: step.successCriteria}),
    })),
  }));
}

// toYaml(testCases: TestCase[]): string {
//   return castExists(this.jsYaml).safeDump(this.toYamlTestCases(testCases));
// }

function castExists<T>(it: T | null | undefined, errorMessage: string): T {
  if (it == null) {
    // error
  }
  return it!
}

function fromYamlTestCases(
  appName: string,
  yamlTestCases: YamlTestCase[],
): TestCase[] {
  return yamlTestCases.map((yamlTestCase) => ({
    displayName: castExists(yamlTestCase.displayName, 'displayName'),
    aiInstructions: {
      steps: castExists(yamlTestCase.steps, 'steps').map((yamlStep) => ({
        goal: castExists(yamlStep.goal, 'goal'),
        ...(yamlStep.hint && {hint: yamlStep.hint}),
        ...(yamlStep.successCriteria && {
          successCriteria: yamlStep.successCriteria,
        }),
      })),
    },
    ...(yamlTestCase.id && {
      name: `${appName}/testCases/${yamlTestCase.id}`,
    }),
    ...(yamlTestCase.prerequisiteTestCaseId && {
      prerequisiteTestCase: `${appName}/testCases/${yamlTestCase.prerequisiteTestCaseId}`,
    }),
  }));
}

// fromYaml(appName: string, yaml: string): TestCase[] {
//   return this.fromYamlTestCases(
//     appName,
//     castExists(this.jsYaml).safeLoad(yaml) as YamlTestCase[],
//   );
// }
