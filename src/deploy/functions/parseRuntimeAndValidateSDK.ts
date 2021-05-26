import * as _ from "lodash";
import * as path from "path";
import * as clc from "cli-color";
import * as semver from "semver";

import { FirebaseError } from "../../error";
import { getFunctionsSDKVersion } from "../../checkFirebaseSDKVersion";
import { logger } from "../../logger";
import * as backend from "./backend";
import * as utils from "../../utils";
import * as track from "../../track";

// have to require this because no @types/cjson available
// eslint-disable-next-line @typescript-eslint/no-var-requires
const cjson = require("cjson");

const MESSAGE_FRIENDLY_RUNTIMES: Record<backend.Runtime | DeprecatedRuntime, string> = {
  nodejs6: "Node.js 6 (Deprecated)",
  nodejs8: "Node.js 8 (Deprecated)",
  nodejs10: "Node.js 10",
  nodejs12: "Node.js 12",
  nodejs14: "Node.js 14 (Beta)",
};

const DEPRECATED_RUTNIMES = ["nodejs6", "nodejs8"];

type DeprecatedRuntime = typeof DEPRECATED_RUTNIMES[number];

const ENGINE_RUNTIMES: Record<number, backend.Runtime | DeprecatedRuntime> = {
  6: "nodejs6",
  8: "nodejs8",
  10: "nodejs10",
  12: "nodejs12",
  14: "nodejs14",
};

const ENGINE_RUNTIMES_NAMES = Object.values(ENGINE_RUNTIMES);

export const RUNTIME_NOT_SET =
  "`runtime` field is required but was not found in firebase.json.\n" +
  "To fix this, add the following lines to the `functions` section of your firebase.json:\n" +
  '"runtime": "nodejs12"\n';

export const UNSUPPORTED_NODE_VERSION_FIREBASE_JSON_MSG = clc.bold(
  `functions.runtime value is unsupported. ` +
    `Valid choices are: ${clc.bold("nodejs10")}, ${clc.bold("nodejs12")}, and ${clc.bold(
      "nodejs14"
    )}.`
);

export const UNSUPPORTED_NODE_VERSION_PACKAGE_JSON_MSG = clc.bold(
  `package.json in functions directory has an engines field which is unsupported. ` +
    `Valid choices are: ${clc.bold('{"node": "10"}')}, ${clc.bold('{"node":"12"}')}, and ${clc.bold(
      '{"node":"14"}'
    )}.`
);

export const DEPRECATED_NODE_VERSION_INFO =
  `\n\nDeploys to runtimes below Node.js 10 are now disabled in the Firebase CLI. ` +
  `${clc.bold(
    `Existing Node.js 8 functions ${clc.underline("will stop executing on 2021-03-15")}`
  )}. Update existing functions to Node.js 10 or greater as soon as possible.`;

export const FUNCTIONS_SDK_VERSION_TOO_OLD_WARNING =
  clc.bold.yellow("functions: ") +
  "You must have a " +
  clc.bold("firebase-functions") +
  " version that is at least 2.0.0. Please run " +
  clc.bold("npm i --save firebase-functions@latest") +
  " in the functions folder.";

function functionsSDKTooOld(sourceDir: string, minRange: string): boolean {
  const userVersion = getFunctionsSDKVersion(sourceDir);
  if (!userVersion) {
    logger.debug("getFunctionsSDKVersion was unable to retrieve 'firebase-functions' version");
    return false;
  }
  try {
    if (!semver.intersects(userVersion, minRange)) {
      return true;
    }
  } catch (e) {
    // do nothing
  }

  return false;
}

/**
 * Returns a friendly string denoting the chosen runtime: Node.js 8 for nodejs 8
 * for example. If no friendly name for runtime is found, returns back the raw runtime.
 * @param runtime name of runtime in raw format, ie, "nodejs8" or "nodejs10"
 * @return A human-friendly string describing the runtime.
 */
export function getHumanFriendlyRuntimeName(runtime: backend.Runtime | DeprecatedRuntime): string {
  return _.get(MESSAGE_FRIENDLY_RUNTIMES, runtime, runtime);
}

function getRuntimeChoiceFromPackageJson(sourceDir: string): backend.Runtime | DeprecatedRuntime {
  const packageJsonPath = path.join(sourceDir, "package.json");
  let loaded;
  try {
    loaded = cjson.load(packageJsonPath);
  } catch (err) {
    throw new FirebaseError(`Unable to load ${packageJsonPath}: ${err}`);
  }
  const engines = loaded.engines;
  if (!engines || !engines.node) {
    // We should really never hit this, since deploy/functions/prepare already checked that
    // the runtime is defined in either firebase.json or the "engines" field of the package.json.
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
export function getRuntimeChoice(sourceDir: string, runtimeFromConfig?: string): backend.Runtime {
  const runtime = runtimeFromConfig || getRuntimeChoiceFromPackageJson(sourceDir);
  const errorMessage =
    (runtimeFromConfig
      ? UNSUPPORTED_NODE_VERSION_FIREBASE_JSON_MSG
      : UNSUPPORTED_NODE_VERSION_PACKAGE_JSON_MSG) + DEPRECATED_NODE_VERSION_INFO;

  if (!runtime || !ENGINE_RUNTIMES_NAMES.includes(runtime)) {
    track("functions_runtime_notices", "package_missing_runtime");
    throw new FirebaseError(errorMessage, { exit: 1 });
  }

  // Note: the backend.isValidRuntime should always be true because we've verified
  // it's in ENGINE_RUNTIME_NAMES and not in DEPRECATED_RUNTIMES. This is still a
  // good defense in depth and also lets us upcast the response to Runtime safely.
  if (DEPRECATED_RUTNIMES.includes(runtime) || !backend.isValidRuntime(runtime)) {
    track("functions_runtime_notices", `${runtime}_deploy_prohibited`);
    throw new FirebaseError(errorMessage, { exit: 1 });
  }

  if (functionsSDKTooOld(sourceDir, ">=2")) {
    track("functions_runtime_notices", "functions_sdk_too_old");
    utils.logWarning(FUNCTIONS_SDK_VERSION_TOO_OLD_WARNING);
  }

  return runtime;
}
