import * as fs from "fs-extra";
import { Command } from "../command";
import { toYaml } from "../appdistribution/yaml_helper";
import { requireAuth } from "../requireAuth";
import { AppDistributionClient } from "../appdistribution/client";
import { getAppName } from "../appdistribution/options-parser-util";
import { TestCase, ListTestCasesResponse } from "../appdistribution/types";
import { FirebaseError } from "../error";
import * as utils from "../utils";

export const command = new Command("appdistribution:testcases:export <test-cases-yaml-file>")
  .description("export test cases as a YAML file")
  .option("--app <app_id>", "the app id of your Firebase app")
  .before(requireAuth)
  .action(async (yamlFile: string, options?: any): Promise<ListTestCasesResponse> => {
    const appName = getAppName(options);
    const appDistroClient = new AppDistributionClient();
    let testCases: TestCase[];
    try {
      testCases = await appDistroClient.listTestCases(appName);
    } catch (err: any) {
      throw new FirebaseError("Failed to list test cases.", {
        exit: 1,
        original: err,
      });
    }
    fs.writeFileSync(yamlFile, toYaml(testCases), "utf8");
    utils.logSuccess(`Exported ${testCases.length} test cases to ${yamlFile}`);
    return { testCases };
  });
