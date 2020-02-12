import * as _ from "lodash";
import * as path from "path";
import * as clc from "cli-color";
import * as semver from "semver";

import { FirebaseError } from "./error";
import * as utils from "./utils";

// have to require this because no @types/cjson available
// tslint:disable-next-line
const cjson = require("cjson");

const MESSAGE_FRIENDLY_RUNTIMES: { [key: string]: string } = {
  nodejs6: "Node.js 6 (Deprecated)",
  nodejs8: "Node.js 8",
  nodejs10: "Node.js 10 (Beta)",
};

const ENGINE_RUNTIMES: { [key: string]: string } = {
  6: "nodejs6",
  8: "nodejs8",
  10: "nodejs10",
};

export const ENGINES_FIELD_REQUIRED_MSG = clc.bold(
  "Engines field is required in package.json but none was found."
);
export const UNSUPPORTED_NODE_VERSION_MSG = clc.bold(
  `package.json in functions directory has an engines field which is unsupported. ` +
    `The only valid choices are: ${clc.bold('{"node": "8"}')} and ${clc.bold('{"node": "10"}')}. ` +
    `Note that Node.js 6 is now deprecated.`
);
export const DEPRECATION_WARNING_MSG =
  clc.bold.yellow("functions: ") +
  "Deploying functions to Node 6 runtime, which is deprecated. Node 8 is available " +
  "and is the recommended runtime.";

export const FUNCTIONS_SDK_VERSION_TOO_OLD_WARNING =
  clc.bold.yellow("functions: ") +
  "You must have a " +
  clc.bold("firebase-functions") +
  " version that is at least 2.0.0. Please run " +
  clc.bold("npm i --save firebase-functions@latest") +
  " in the functions folder.";

/**
 * Returns a friendly string denoting the chosen runtime: Node.js 8 for nodejs 8
 * for example. If no friendly name for runtime is found, returns back the raw runtime.
 * @param runtime name of runtime in raw format, ie, "nodejs8" or "nodejs10"
 */
export function getHumanFriendlyRuntimeName(runtime: string): string {
  return _.get(MESSAGE_FRIENDLY_RUNTIMES, runtime, runtime);
}

/**
 * Returns the Node.js version to be used for the function(s) as defined in the
 * package.json.
 * @param sourceDir directory where the functions are defined.
 */
export function getRuntimeChoice(sourceDir: string): any {
  const packageJsonPath = path.join(sourceDir, "package.json");
  const loaded = cjson.load(packageJsonPath);
  const engines = loaded.engines;
  if (!engines || !engines.node) {
    return null;
    // TODO(b/129422952): Change to throw error instead of returning null
    // when engines field in package.json becomes required:
    // throw new FirebaseError(ENGINES_FIELD_REQUIRED_MSG, { exit: 1 });
  }
  const runtime = ENGINE_RUNTIMES[engines.node];
  if (!runtime) {
    throw new FirebaseError(UNSUPPORTED_NODE_VERSION_MSG, { exit: 1 });
  }

  if (runtime === "nodejs6") {
    utils.logWarning(DEPRECATION_WARNING_MSG);
  } else {
    // for any other runtime (8 or 10)
    if (functionsSDKTooOld(loaded)) {
      utils.logWarning(FUNCTIONS_SDK_VERSION_TOO_OLD_WARNING);
    }
  }
  return runtime;
}

function functionsSDKTooOld(loaded: any): boolean {
  const SDKRange = _.get(loaded, "dependencies.firebase-functions");
  try {
    if (!semver.intersects(SDKRange, ">=2")) {
      return true;
    }
  } catch (e) {
    // do nothing
  }
  return false;
}
