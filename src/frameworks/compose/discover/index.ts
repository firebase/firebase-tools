import { Runtime, FileSystem, FrameworkSpec, RuntimeSpec, FrameworkHooks } from "./types";
import { NodejsRuntime } from "./runtime/node";
import { FirebaseError } from "../../../error";
import { AppBundle } from "../interfaces";

/**
 * Discover framework in the given project directory
 */
const availableRuntimes: Runtime[] = [new NodejsRuntime()];

/**
 *
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
          throw new FirebaseError("Multiple runtimes discovered for the codebase");
        }
      }
    }

    if (!discoveredRuntime) {
      throw new FirebaseError("No runtime discovered for the codebase");
    }

    const runtimeSpec = await discoveredRuntime.analyseCodebase(fs, allFrameworkSpecs);

    if (runtimeSpec) {
      runtimeSpec.frameworkHooks = getFrameworkHooks();
    }

    return runtimeSpec;
  } catch (error: any) {
    throw new FirebaseError(`Failed to discover the codebase: ${error}`);
  }
}

function getFrameworkHooks(): FrameworkHooks {
  const hooks: FrameworkHooks = {};

  hooks.afterBuild = (b: AppBundle) => {
    console.log("HOOK: AFTER INSTALL");
    return { ...b, version: "v1alpha", notes: "afterInstall" };
  };

  hooks.afterInstall = (b: AppBundle) => {
    console.log("HOOK: AFTER BUILD");
    return { ...b, version: "v1alpha", notes: "afterBuild" };
  };

  return hooks;
}
