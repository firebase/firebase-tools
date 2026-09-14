import { Command } from "../command";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import { requireAuth } from "../requireAuth";
import * as suiteModule from "../apphosting/compare/suite";
import * as lifecycle from "../apphosting/compare/lifecycle";
import * as slots from "../apphosting/compare/slots";
import * as fs from "fs-extra";
import { FirebaseError } from "../error";
import { logger } from "../logger";

export const command = new Command("apphosting:compare")
  .description(
    "Autonomously deploy and compare two versions/configurations of a Firebase App Hosting codebase",
  )
  .option(
    "--location <location>",
    "the primary region of the App Hosting backends to use",
    "us-central1",
  )
  .option(
    "--path-a <pathA>",
    "path to directory containing codebase version A (defaults to current directory)",
    ".",
  )
  .option(
    "--path-b <pathB>",
    "path to directory containing codebase version B (defaults to path-a or current directory)",
  )
  .option("--local-build-a", "compile and deploy version A using a local build")
  .option("--local-build-b", "compile and deploy version B using a local build")
  .option(
    "--runtime-a <runtimeA>",
    "specify the ABIU runtime version for backend A (e.g. nodejs22)",
  )
  .option(
    "--runtime-b <runtimeB>",
    "specify the ABIU runtime version for backend B (e.g. nodejs22)",
  )
  .option(
    "--output-dir <outputDir>",
    "directory to output comparison report files",
    "./compare-report",
  )
  .before(requireAuth)
  .action(async (options: Options) => {
    const projectId = needProjectId(options);
    const location = options.location as string;
    const pathA = (options.pathA as string) || ".";
    const pathB = (options.pathB as string) || pathA;

    lifecycle.validateProject(projectId);
    await lifecycle.runGarbageCollection(projectId, location);

    const slot = await slots.acquireComparisonSlot(projectId, location, 2);

    const cleanUp = async () => {
      logger.warn("\nInterrupted. Restoring comparison slot lock and cleaning up temp files...");
      for (const configPath of suiteModule.createdConfigs) {
        try {
          await fs.remove(configPath);
        } catch (e) {}
      }
      await slots.releaseComparisonSlot(projectId, location, slot.index, 2);
      process.exit(1);
    };
    process.on("SIGINT", cleanUp);
    process.on("SIGTERM", cleanUp);

    try {
      await suiteModule.runCompareSuite(
        projectId,
        location,
        slot.backendIds,
        slot.index,
        "Single-Comparison-Run",
        [
          {
            path: pathA,
            localBuild: !!options.localBuildA,
            runtime: options.runtimeA as string | undefined,
          },
          {
            path: pathB,
            localBuild: !!options.localBuildB,
            runtime: options.runtimeB as string | undefined,
          },
        ],
        {
          outputDir: options.outputDir as string,
        },
      );
    } finally {
      process.off("SIGINT", cleanUp);
      process.off("SIGTERM", cleanUp);
      await slots.releaseComparisonSlot(projectId, location, slot.index, 2);
    }
  });
