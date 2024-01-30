import * as path from "path";
import * as clc from "colorette";

import { FirebaseError } from "../../../../error";
import * as runtimes from "../../runtimes";

// have to require this because no @types/cjson available
// eslint-disable-next-line @typescript-eslint/no-var-requires
const cjson = require("cjson");

const ENGINE_RUNTIMES: Record<number, runtimes.Runtime | runtimes.DeprecatedRuntime> = {
  6: "nodejs6",
  8: "nodejs8",
  10: "nodejs10",
  12: "nodejs12",
  14: "nodejs14",
  16: "nodejs16",
  18: "nodejs18",
  20: "nodejs20",
};

const ENGINE_RUNTIMES_NAMES = Object.values(ENGINE_RUNTIMES);

export const RUNTIME_NOT_SET =
  "`runtime` field is required but was not found in firebase.json.\n" +
  "To fix this, add the following lines to the `functions` section of your firebase.json:\n" +
  '"runtime": "nodejs18"\n';

export const UNSUPPORTED_NODE_VERSION_FIREBASE_JSON_MSG = clc.bold(
  `functions.runtime value is unsupported. ` +
    `Valid choices are: ${clc.bold("nodejs{10|12|14|16|18|20}")}.`,
);

export const UNSUPPORTED_NODE_VERSION_PACKAGE_JSON_MSG = clc.bold(
  `package.json in functions directory has an engines field which is unsupported. ` +
    `Valid choices are: ${clc.bold('{"node": 10|12|14|16|18|20}')}`,
);

export const DEPRECATED_NODE_VERSION_INFO =
  `\n\nDeploys to runtimes below Node.js 10 are now disabled in the Firebase CLI. ` +
  `${clc.bold(
    `Existing Node.js 8 functions ${clc.underline("will stop executing at a future date")}`,
  )}. Update existing functions to Node.js 10 or greater as soon as possible.`;

function getRuntimeChoiceFromPackageJson(
  sourceDir: string,
): runtimes.Runtime | runtimes.DeprecatedRuntime {
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

  return ENGINE_RUNTIMES[engines.node];
}

/**
 * Returns the Node.js version to be used for the function(s) as defined in the
 * either the `runtime` field of firebase.json or the package.json.
 * @param sourceDir directory where the functions are defined.
 * @param runtimeFromConfig runtime from the `functions` section of firebase.json file (may be empty).
 * @return The runtime, e.g. `nodejs12`.
 */
export function getRuntimeChoice(sourceDir: string, runtimeFromConfig?: string): runtimes.Runtime {
  const runtime = runtimeFromConfig || getRuntimeChoiceFromPackageJson(sourceDir);
  const errorMessage =
    (runtimeFromConfig
      ? UNSUPPORTED_NODE_VERSION_FIREBASE_JSON_MSG
      : UNSUPPORTED_NODE_VERSION_PACKAGE_JSON_MSG) + DEPRECATED_NODE_VERSION_INFO;

  if (!runtime || !ENGINE_RUNTIMES_NAMES.includes(runtime)) {
    throw new FirebaseError(errorMessage, { exit: 1 });
  }

  // Note: the runtimes.isValidRuntime should always be true because we've verified
  // it's in ENGINE_RUNTIME_NAMES and not in DEPRECATED_RUNTIMES. This is still a
  // good defense in depth and also lets us upcast the response to Runtime safely.
  if (runtimes.isDeprecatedRuntime(runtime) || !runtimes.isValidRuntime(runtime)) {
    throw new FirebaseError(errorMessage, { exit: 1 });
  }

  return runtime;
}
