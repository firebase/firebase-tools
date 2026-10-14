import { Runtime, FileSystem, FrameworkSpec, RuntimeSpec } from "./types";
import { NodejsRuntime } from "./runtime/node";
import { FirebaseError } from "../../../error";

const supportedRuntimes: Runtime[] = [new NodejsRuntime()];

/**
 * Discover the best matching runtime specs for the application.
 */
export async function discover(
  fs: FileSystem,
  allFrameworkSpecs: FrameworkSpec[],
): Promise<RuntimeSpec> {
  try {
    let discoveredRuntime = undefined;
    for (const runtime of supportedRuntimes) {
      if (await runtime.match(fs)) {
        if (!discoveredRuntime) {
          discoveredRuntime = runtime;
        } else {
          throw new FirebaseError(
            `Conflit occurred as multiple runtimes ${discoveredRuntime.getRuntimeName()}, ${runtime.getRuntimeName()} are discovered in the application.`,
          );
        }
      }
    }

    if (!discoveredRuntime) {
      throw new FirebaseError(
        `Unable to determine the specific runtime for the application. The supported runtime options include ${supportedRuntimes
          .map((x) => x.getRuntimeName())
          .join(" , ")}.`,
      );
    }
    const runtimeSpec = await discoveredRuntime.analyseCodebase(fs, allFrameworkSpecs);

    return runtimeSpec;
  } catch (error: any) {
    throw new FirebaseError(
      `Failed to identify required specifications to execute the application: ${error}`,
    );
  }
}
