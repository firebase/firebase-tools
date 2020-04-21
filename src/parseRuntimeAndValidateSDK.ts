import * as _ from "lodash";
import * as path from "path";
import * as clc from "cli-color";
import * as semver from "semver";

import { getFunctionsSDKVersion } from "./checkFirebaseSDKVersion";
import { FirebaseError } from "./error";
import * as utils from "./utils";
import * as logger from "./logger";
import * as track from "./track";

// have to require this because no @types/cjson available
// eslint-disable-next-line @typescript-eslint/no-var-requires
const cjson = require("cjson");

const MESSAGE_FRIENDLY_RUNTIMES: { [key: string]: string } = {
  nodejs6: "Node.js 6 (Deprecated)",
  nodejs8: "Node.js 8",
  nodejs10: "Node.js 10",
};

const ENGINE_RUNTIMES: { [key: string]: string } = {
  6: "nodejs6",
  8: "nodejs8",
  10: "nodejs10",
};

export const UNSUPPORTED_NODE_VERSION_MSG = clc.bold(
  `package.json in functions directory has an engines field which is unsupported. ` +
    `The only valid choices are: ${clc.bold('{"node": "8"}')} and ${clc.bold('{"node": "10"}')}.`
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
export function getHumanFriendlyRuntimeName(runtime: string): string {
  return _.get(MESSAGE_FRIENDLY_RUNTIMES, runtime, runtime);
}

/**
 * Returns the Node.js version to be used for the function(s) as defined in the
 * package.json.
 * @param sourceDir directory where the functions are defined.
 * @return The runtime, e.g. `nodejs10`.
 */
export function getRuntimeChoice(sourceDir: string): string {
  const packageJsonPath = path.join(sourceDir, "package.json");
  const loaded = cjson.load(packageJsonPath);
  const engines = loaded.engines;
  if (!engines || !engines.node) {
    // We should really never hit this, since deploy/functions/prepare already checked that package.json has an "engines" field.
    throw new FirebaseError(
      `Engines field is required but was not found in package.json.\n` +
        `To fix this, add the following lines to your package.json: \n
      "engines": {
        "node": "10"
      }\n`
    );
  }
  const runtime = ENGINE_RUNTIMES[engines.node];
  if (!runtime) {
    track("functions_runtime_notices", "package_missing_runtime");
    throw new FirebaseError(UNSUPPORTED_NODE_VERSION_MSG, { exit: 1 });
  }

  if (runtime === "nodejs6") {
    track("functions_runtime_notices", "nodejs6_deploy_prohibited");
    throw new FirebaseError(UNSUPPORTED_NODE_VERSION_MSG, { exit: 1 });
  } else {
    if (functionsSDKTooOld(sourceDir, ">=2")) {
      track("functions_runtime_notices", "functions_sdk_too_old");
      utils.logWarning(FUNCTIONS_SDK_VERSION_TOO_OLD_WARNING);
    }
  }
  return runtime;
}
