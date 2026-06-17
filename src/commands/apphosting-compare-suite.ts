import { Command } from "../command";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import { requireAuth } from "../requireAuth";
import { runCompareSuite } from "../apphosting/compare/suite";
import { FirebaseError } from "../error";
import * as fs from "fs-extra";
import * as path from "path";
import { logger } from "../logger";

export const command = new Command("apphosting:compare-suite")
  .description("Autonomously run a suite of comparison tests on multiple App Hosting codebases")
  .option(
    "--location <location>",
    "the primary region of the App Hosting backends to use",
    "us-central1",
  )
  .option("--suite-config <configPath>", "path to comparison suite JSON configuration file")
  .option(
    "--output-dir <outputDir>",
    "directory to output comparison report files",
    "./compare-report",
  )
  .before(requireAuth)
  .action(async (options: Options) => {
    const projectId = needProjectId(options);
    const location = options.location as string;
    const configPath = options.suiteConfig as string;

    if (!configPath) {
      throw new FirebaseError(
        "Must specify --suite-config file containing the list of apps to compare.",
      );
    }

    if (!(await fs.pathExists(configPath))) {
      throw new FirebaseError(`Suite config file does not exist at ${configPath}`);
    }

    const suite = await fs.readJson(configPath);
    if (!Array.isArray(suite)) {
      throw new FirebaseError("Suite config must be a JSON array of test cases.");
    }

    logger.info(`Starting suite of ${suite.length} comparison tests...`);
    for (const testCase of suite) {
      logger.info(`\nRunning test case: ${testCase.name || "Unnamed Test"}`);
      const caseOutputDir = path.join(options.outputDir as string, testCase.name || "unnamed");

      if (!testCase.variants || testCase.variants.length < 2) {
        throw new FirebaseError(
          `Test case ${testCase.name} must have a "variants" array with at least 2 configurations.`,
        );
      }

      try {
        await runCompareSuite(projectId, location, testCase.variants, {
          outputDir: caseOutputDir,
        });
      } catch (err: any) {
        logger.error(`Matrix execution for ${testCase.name} failed: ${err.message}`);
      }
    }
  });
