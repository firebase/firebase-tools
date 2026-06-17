import { Command } from "../command";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import { requireAuth } from "../requireAuth";
import * as suiteModule from "../apphosting/compare/suite";
import * as lifecycle from "../apphosting/compare/lifecycle";
import * as slots from "../apphosting/compare/slots";
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
  .option("--record-only", "only deploy variants and record their output, skipping diffing")
  .option("--compare-only", "run comparisons based on previously cached recordings, skipping deployment")
  .option("--serve", "spin up the localhost comparison viewer dashboard")
  .option("--port <port>", "port to run the localhost comparison viewer on", "3000")
  .before(requireAuth)
  .action(async (options: Options) => {
    if (options.serve) {
      const { startServer } = require("../apphosting/compare/server");
      const port = parseInt(options.port as string, 10) || 3000;
      await startServer(port);
      return;
    }

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

    lifecycle.validateProject(projectId);

    // === OPTION A: COMPARE ONLY (NO SLOTS / DEPLOYMENTS) ===
    if (options.compareOnly) {
      logger.info(`Starting comparison run for ${suite.length} test cases using cache...`);
      for (const testCase of suite) {
        logger.info(`\nComparing test case: ${testCase.name || "Unnamed Test"}`);
        const caseOutputDir = path.join(options.outputDir as string, testCase.name || "unnamed");

        try {
          await suiteModule.runCompareSuite(projectId, location, [], 0, testCase.name, testCase.variants, {
            outputDir: caseOutputDir,
            compareOnly: true,
          });
        } catch (err: any) {
          logger.error(`Parity run for ${testCase.name} failed: ${err.message}`);
        }
      }
      return;
    }

    // === OPTION B: RECORD (Requires locking GCM Slot) ===
    await lifecycle.runGarbageCollection(projectId, location);

    // Compute max variants to acquire a slot large enough
    const maxVariants = Math.max(...suite.map((tc: any) => tc.variants?.length || 0));
    if (maxVariants < 2) {
      throw new FirebaseError("All test cases must have at least 2 variants.");
    }

    const slot = await slots.acquireComparisonSlot(projectId, location, maxVariants);
    logger.info(`Acquired Comparison Slot ${slot.index} globally for the suite run.`);

    const cleanUp = async () => {
      logger.warn("\nInterrupted. Restoring comparison slot lock and cleaning up temp files...");
      for (const configPath of suiteModule.createdConfigs) {
        try {
          await fs.remove(configPath);
        } catch (e) {}
      }
      await slots.releaseComparisonSlot(projectId, location, slot.index, maxVariants);
      process.exit(1);
    };
    process.on("SIGINT", cleanUp);
    process.on("SIGTERM", cleanUp);

    try {
      logger.info(`Starting suite of ${suite.length} comparison tests...`);
      for (const testCase of suite) {
        logger.info(`\nRunning test case: ${testCase.name || "Unnamed Test"}`);
        const caseOutputDir = path.join(options.outputDir as string, testCase.name || "unnamed");

        if (!testCase.variants || testCase.variants.length < 2) {
          logger.error(`Skipping test case ${testCase.name}: must have at least 2 configurations.`);
          continue;
        }

        // Slice slot.backendIds to match the current testCase's variant count
        const caseBackendIds = slot.backendIds.slice(0, testCase.variants.length);

        try {
          await suiteModule.runCompareSuite(
            projectId,
            location,
            caseBackendIds,
            slot.index,
            testCase.name,
            testCase.variants,
            {
              outputDir: caseOutputDir,
              recordOnly: !!options.recordOnly,
              compareOnly: false,
            }
          );
        } catch (err: any) {
          logger.error(`Matrix execution for ${testCase.name} failed: ${err.message}`);
        }
      }
    } finally {
      process.off("SIGINT", cleanUp);
      process.off("SIGTERM", cleanUp);
      await slots.releaseComparisonSlot(projectId, location, slot.index, maxVariants);
    }
  });
