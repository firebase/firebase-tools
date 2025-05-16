import { dirExistsSync, fileExistsSync, listFiles, readFile } from "../fsutils";
import { join } from "path";
import { parse } from "yaml";
import { logger } from "../logger";
import { TestDef } from "./types";

function createFilter(pattern?: string) {
  const regex = pattern ? new RegExp(pattern) : undefined;
  return (s: string) => !regex || regex.test(s);
}

export function parseTestFiles(dir: string, filePattern?: string, namePattern?: string): TestDef[] {
  const fileFilterFn = createFilter(filePattern);
  const nameFilterFn = createFilter(namePattern);

  function parseTestFilesRecursive(dir: string): any[] {
    const items = listFiles(dir);
    const results = [];
    for (const item of items) {
      const path = join(dir, item);
      if (dirExistsSync(path)) {
        results.push(...parseTestFilesRecursive(path));
      } else if (fileFilterFn(path) && fileExistsSync(path)) {
        let parsedFile;
        try {
          parsedFile = parse(readFile(path));
          const tests = parsedFile.tests;
          const defaultConfig = parsedFile.defaultConfig;
          if (!tests || !tests.length) {
            logger.info(`No tests found in ${path}. Ignoring.`);
            continue;
          }
          for (const rawTestDef of parsedFile.tests) {
            const testDef = toTestDef(rawTestDef, path, defaultConfig);
            if (nameFilterFn(testDef.testName)) {
              results.push(testDef);
            }
          }
        } catch (ex) {
          logger.info(`Unable to parse test file ${path}. Ignoring.`);
          continue;
        }
      }
    }
    return results;
  }

  return parseTestFilesRecursive(dir);
}

function toTestDef(testDef: any, path: string, defaultConfig: any): TestDef {
  const steps = testDef.steps || [];
  return {
    id: path + testDef.testName,
    testName: testDef.testName,
    testConfig: {
      browsers: testDef.testConfig?.browsers || defaultConfig?.browsers,
    },
    steps: steps.map((step: any) => ({
      goal: step.goal,
      successCriteria: step.successCriteria,
      hint: step.hint,
    })),
  };
}
