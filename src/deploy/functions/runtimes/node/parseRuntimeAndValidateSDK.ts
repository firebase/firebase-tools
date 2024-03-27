import * as path from "path";

import { FirebaseError } from "../../../../error";
import * as supported from "../supported";

// have to require this because no @types/cjson available
// eslint-disable-next-line @typescript-eslint/no-var-requires
const cjson = require("cjson");

const supportedNodeVersions: string[] = Object.keys(supported.RUNTIMES)
  .filter((s) => supported.runtimeIsLanguage(s as supported.Runtime, "nodejs"))
  .filter((s) => !supported.isDecommissioned(s as supported.Runtime))
  .map((s) => s.substring("nodejs".length));

export const RUNTIME_NOT_SET =
  "`runtime` field is required but was not found in firebase.json or package.json.\n" +
  "To fix this, add the following lines to the `functions` section of your firebase.json:\n" +
  `"runtime": "${supported.latest("nodejs")}" or set the "engine" field in package.json\n`;

function getRuntimeChoiceFromPackageJson(sourceDir: string): supported.Runtime {
  const packageJsonPath = path.join(sourceDir, "package.json");
  let loaded;
  try {
    loaded = cjson.load(packageJsonPath);
  } catch (err: any) {
    throw new FirebaseError(`Unable to load ${packageJsonPath}: ${err}`);
  }
  const engines = loaded.engines;
  if (!engines || !engines.node) {
    // It's a little strange, but we're throwing an error telling customers to put runtime in firebase.json
    // if it isn't set in package.json. This is because we know through the order of function calls (note this
    // method isn't exported) that this condition is only hit if we've checked both firebase.json and
    // package.json.
    throw new FirebaseError(RUNTIME_NOT_SET);
  }

  const runtime = `nodejs${engines.node}`;
  if (!supported.isRuntime(runtime)) {
    throw new FirebaseError(
      `Detected node engine ${engines.node} in package.json, which is not a ` +
        `supported version. Valid versions are ${supportedNodeVersions.join(", ")}`,
    );
  }
  return runtime;
}

/**
 * Returns the Node.js version to be used for the function(s) as defined in the
 * either the `runtime` field of firebase.json or the package.json.
 * @param sourceDir directory where the functions are defined.
 * @param runtimeFromConfig runtime from the `functions` section of firebase.json file (may be empty).
 * @return The runtime, e.g. `nodejs12`.
 */
export function getRuntimeChoice(
  sourceDir: string,
  runtimeFromConfig?: supported.Runtime,
): supported.Runtime {
  return runtimeFromConfig || getRuntimeChoiceFromPackageJson(sourceDir);
}
