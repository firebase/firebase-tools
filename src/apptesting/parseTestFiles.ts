import { dirExistsSync, fileExistsSync, listFiles } from "../fsutils";
import { join } from "path";
import { logger } from "../logger";
import { Browser, TestCaseInvocation, TestStep } from "./types";
import { readFileFromDirectory, wrappedSafeLoad } from "../utils";
import { FirebaseError, getErrMsg, getError } from "../error";

export async function parseTestFiles(
  dir: string,
  targetUri?: string,
  filePattern?: string,
  namePattern?: string,
): Promise<TestCaseInvocation[]> {
  if (targetUri) {
    try {
      new URL(targetUri);
    } catch (ex) {
      const errMsg =
        "Invalid URL" + (targetUri.startsWith("http") ? "" : " (must include protocol)");
      throw new FirebaseError(errMsg, { original: getError(ex) });
    }
  }

  const files = await parseTestFilesRecursive({ testDir: dir, targetUri });
  const idToInvocation = files
    .flatMap((file) => file.invocations)
    .reduce(
      (accumulator, invocation) => {
        if (invocation.testCase.id) {
          accumulator[invocation.testCase.id] = invocation;
        }
        return accumulator;
      },
      {} as Record<string, TestCaseInvocation>,
    );

  const fileFilterFn = createFilter(filePattern);
  const nameFilterFn = createFilter(namePattern);
  const filteredInvocations = files
    .filter((file) => fileFilterFn(file.path))
    .flatMap((file) => file.invocations)
    .filter((invocation) => nameFilterFn(invocation.testCase.displayName));

  return filteredInvocations.map((invocation) => {
    let prerequisiteTestCaseId = invocation.testCase.prerequisiteTestCaseId;
    if (prerequisiteTestCaseId === undefined) {
      return invocation;
    }

    const prerequisiteSteps: TestStep[] = [];
    const previousTestCaseIds = new Set<string>();
    while (prerequisiteTestCaseId) {
      if (previousTestCaseIds.has(prerequisiteTestCaseId)) {
        throw new FirebaseError(`Detected a cycle in prerequisite test cases.`);
      }
      previousTestCaseIds.add(prerequisiteTestCaseId);
      const prerequisiteTestCaseInvocation: TestCaseInvocation | undefined =
        idToInvocation[prerequisiteTestCaseId];
      if (prerequisiteTestCaseInvocation === undefined) {
        throw new FirebaseError(
          `Invalid prerequisiteTestCaseId. There is no test case with id ${prerequisiteTestCaseId}`,
        );
      }
      prerequisiteSteps.unshift(...prerequisiteTestCaseInvocation.testCase.steps);
      prerequisiteTestCaseId = prerequisiteTestCaseInvocation.testCase.prerequisiteTestCaseId;
    }

    return {
      ...invocation,
      testCase: {
        ...invocation.testCase,
        steps: prerequisiteSteps.concat(invocation.testCase.steps),
      },
    };
  });
}

function createFilter(pattern?: string) {
  const regex = pattern ? new RegExp(pattern) : undefined;
  return (s: string) => !regex || regex.test(s);
}

interface TestCaseFile {
  path: string;
  invocations: TestCaseInvocation[];
}

async function parseTestFilesRecursive(params: {
  testDir: string;
  targetUri?: string;
}): Promise<TestCaseFile[]> {
  const testDir = params.testDir;
  const targetUri = params.targetUri;
  const items = listFiles(testDir);
  const results = [];
  for (const item of items) {
    const path = join(testDir, item);
    if (dirExistsSync(path)) {
      results.push(...(await parseTestFilesRecursive({ testDir: path, targetUri })));
    } else if (fileExistsSync(path)) {
      try {
        const file = await readFileFromDirectory(testDir, item);
        logger.debug(`Read the file ${file.source}.`);
        const parsedFile = wrappedSafeLoad(file.source);
        logger.debug(`Parsed the file.`);
        const tests = parsedFile.tests;
        logger.debug(`There are ${tests.length} tests.`);
        const defaultConfig = parsedFile.defaultConfig;
        if (!tests || !tests.length) {
          logger.debug(`No tests found in ${path}. Ignoring.`);
          continue;
        }
        const invocations = [];
        for (const rawTestDef of tests) {
          const invocation = toTestCaseInvocation(rawTestDef, targetUri, defaultConfig);
          invocations.push(invocation);
        }
        results.push({ path, invocations: invocations });
      } catch (ex) {
        const errMsg = getErrMsg(ex);
        const errDetails = errMsg ? `Error details: \n${errMsg}` : "";
        logger.debug(`Unable to parse test file ${path}. Ignoring.${errDetails}`);
        continue;
      }
    }
  }

  return results;
}

function toTestCaseInvocation(
  testDef: any,
  targetUri: any,
  defaultConfig: any,
): TestCaseInvocation {
  const steps = testDef.steps ?? [];
  const route = testDef.testConfig?.route ?? defaultConfig?.route ?? "";
  const browsers: Browser[] = testDef.testConfig?.browsers ??
    defaultConfig?.browsers ?? [Browser.CHROME];
  return {
    testCase: {
      id: testDef.id,
      prerequisiteTestCaseId: testDef.prerequisiteTestCaseId,
      startUri: targetUri + route,
      displayName: testDef.displayName,
      steps: steps,
    },
    testExecution: browsers.map((browser) => ({ config: { browser } })),
  };
}
