import * as fs from "fs-extra";
import { Command } from "../command";
import { fromYaml } from "../appdistribution/yaml_helper";
import { requireAuth } from "../requireAuth";
import { AppDistributionClient } from "../appdistribution/client";
import { getAppName, ensureFileExists } from "../appdistribution/options-parser-util";
import { TestCase } from "../appdistribution/types";
import * as utils from "../utils";
import { FirebaseError } from "../error";

export const command = new Command("appdistribution:testcases:import <test-cases-yaml-file>")
  .description("import test cases from YAML file")
  .option("--app <app_id>", "the app id of your Firebase app")
  .before(requireAuth)
  .action(async (yamlFile: string, options?: any) => {
    const appName = getAppName(options);
    const appDistroClient = new AppDistributionClient();
    ensureFileExists(yamlFile);
    const testCases: TestCase[] = fromYaml(appName, fs.readFileSync(yamlFile, "utf8"));
    const testCasesWithoutName = testCases.filter((tc) => !tc.name);
    // nothing can depend on these test cases yet, since they don't have
    // resource names
    const creationResults = await Promise.allSettled(
      testCasesWithoutName.map((tc) => appDistroClient.createTestCase(appName, tc)),
    );
    const failed = creationResults.filter((r) => r.status === "rejected");
    if (failed.length > 0) {
      for (const f of failed) {
        utils.logWarning((f as any).reason);
      }
      const succeeded = creationResults.length - failed.length;
      throw new FirebaseError(
        `Created ${succeeded} test case(s), but failed to create ${failed.length}.`,
      );
    }
    // any test case with a resource name can be referenced by any other new or
    // existing test case, so we need to batch the upsert.
    const testCasesWithName = testCases.filter((tc) => !!tc.name);
    await appDistroClient.batchUpsertTestCases(appName, testCasesWithName);
    utils.logSuccess(`Imported ${testCases.length} test cases from ${yamlFile}`);
  });
