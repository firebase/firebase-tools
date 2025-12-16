import { dirExistsSync, fileExistsSync, listFiles } from "../fsutils";
import { join } from "path";
import { logger } from "../logger";
import { Browser, TestCaseInvocation } from "./types";
import { readFileFromDirectory, wrappedSafeLoad } from "../utils";
import { FirebaseError, getErrMsg, getError } from "../error";

function createFilter(pattern?: string) {
  const regex = pattern ? new RegExp(pattern) : undefined;
  return (s: string) => !regex || regex.test(s);
}

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

  const fileFilterFn = createFilter(filePattern);
  const nameFilterFn = createFilter(namePattern);

  async function parseTestFilesRecursive(testDir: string): Promise<TestCaseInvocation[]> {
    const items = listFiles(testDir);
    const results = [];
    for (const item of items) {
      const path = join(testDir, item);
      if (dirExistsSync(path)) {
        results.push(...(await parseTestFilesRecursive(path)));
      } else if (fileFilterFn(path) && fileExistsSync(path)) {
        try {
          const file = await readFileFromDirectory(testDir, item);
          const parsedFile = wrappedSafeLoad(file.source);
          const tests = parsedFile.tests;
          const defaultConfig = parsedFile.defaultConfig;
          if (!tests || !tests.length) {
            logger.info(`No tests found in ${path}. Ignoring.`);
            continue;
          }
          for (const rawTestDef of parsedFile.tests) {
            if (!nameFilterFn(rawTestDef.testName)) continue;
            const testDef = toTestDef(rawTestDef, targetUri, defaultConfig);
            results.push(testDef);
          }
        } catch (ex) {
          const errMsg = getErrMsg(ex);
          const errDetails = errMsg ? `Error details: \n${errMsg}` : "";
          logger.info(`Unable to parse test file ${path}. Ignoring.${errDetails}`);
          continue;
        }
      }
    }
    return results;
  }

  return parseTestFilesRecursive(dir);
}

function toTestDef(testDef: any, targetUri: any, defaultConfig: any): TestCaseInvocation {
  const steps = testDef.steps ?? [];
  const route = testDef.testConfig?.route ?? defaultConfig?.route ?? "";
  const browsers: Browser[] = testDef.testConfig?.browsers ??
    defaultConfig?.browsers ?? [Browser.CHROME];
  return {
    testCase: {
      startUri: targetUri + route,
      displayName: testDef.testName,
      instructions: { steps },
    },
    testExecution: browsers.map((browser) => ({ config: { browser } })),
  };
}
