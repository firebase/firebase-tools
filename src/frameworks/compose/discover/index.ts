import { Runtime, FileSystem, FrameworkSpec, RuntimeSpec, FrameworkHooks } from "./types";
import { NodejsRuntime } from "./runtime/node";
import { FirebaseError } from "../../../error";
import { AppBundle } from "../interfaces";

const availableRuntimes: Runtime[] = [new NodejsRuntime()];

/**
 * Discover the best matching runtime specs for the application.
 */
export async function discover(
  fs: FileSystem,
  allFrameworkSpecs: FrameworkSpec[]
): Promise<RuntimeSpec> {
  try {
    let discoveredRuntime = undefined;
    for (const runtime of availableRuntimes) {
      if (await runtime.match(fs)) {
        if (!discoveredRuntime) {
          discoveredRuntime = runtime;
        } else {
          throw new FirebaseError(
            `Conflit occured as multiple runtimes ${discoveredRuntime.getRuntimeName()}, ${runtime.getRuntimeName()} are discovered within the codebase.`
          );
        }
      }
    }

    if (!discoveredRuntime) {
      throw new FirebaseError("Unable to identify a runtime for the codebase");
    }
    const runtimeSpec = await discoveredRuntime.analyseCodebase(fs, allFrameworkSpecs);
    runtimeSpec.frameworkHooks = getFrameworkHooks();

    return runtimeSpec;
  } catch (error: any) {
    throw new FirebaseError(
      `Failed to identify required specifications to execute the application: ${error}`
    );
  }
}

function getFrameworkHooks(): FrameworkHooks {
  return {
    afterBuild: (b: AppBundle) => {
      console.log("HOOK: AFTER INSTALL");
      return { ...b, version: "v1alpha", notes: "afterInstall" };
    },

    afterInstall: (b: AppBundle) => {
      console.log("HOOK: AFTER BUILD");
      return { ...b, version: "v1alpha", notes: "afterBuild" };
    },
  };
}
