import { Command } from "../command";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import { requireAuth } from "../requireAuth";
import { runCompareSuite } from "../apphosting/compare/suite";
import { FirebaseError } from "../error";

export const command = new Command("apphosting:compare")
  .description("Autonomously deploy and compare two versions/configurations of a Firebase App Hosting codebase")
  .option(
    "--location <location>",
    "the primary region of the App Hosting backends to use",
    "us-central1"
  )
  .option(
    "--path-a <pathA>",
    "path to directory containing codebase version A (defaults to current directory)",
    "."
  )
  .option(
    "--path-b <pathB>",
    "path to directory containing codebase version B (defaults to path-a or current directory)"
  )
  .option(
    "--local-build-a",
    "compile and deploy version A using a local build"
  )
  .option(
    "--local-build-b",
    "compile and deploy version B using a local build"
  )
  .option(
    "--runtime-a <runtimeA>",
    "specify the ABIU runtime version for backend A (e.g. nodejs22)"
  )
  .option(
    "--runtime-b <runtimeB>",
    "specify the ABIU runtime version for backend B (e.g. nodejs22)"
  )
  .option(
    "--output-dir <outputDir>",
    "directory to output comparison report files",
    "./compare-report"
  )
  .before(requireAuth)
  .action(async (options: Options) => {
    const projectId = needProjectId(options);
    const location = options.location as string;
    const pathA = (options.pathA as string) || ".";
    const pathB = (options.pathB as string) || pathA;

    await runCompareSuite(projectId, location, pathA, pathB, {
      outputDir: options.outputDir as string,
      localBuildA: !!options.localBuildA,
      localBuildB: !!options.localBuildB,
      runtimeA: options.runtimeA as string,
      runtimeB: options.runtimeB as string
    });
  });
