import * as _ from "lodash";
import * as clc from "cli-color";
import * as path from "path";
import * as semver from "semver";
import * as spawn from "cross-spawn";

import * as utils from "../../../../utils";
import { logger } from "../../../../logger";
import { track } from "../../../../track";

interface NpmListResult {
  name: string;
  dependencies: {
    "firebase-functions": {
      version: string;
      from: string;
      resolved: string;
    };
  };
}

interface NpmShowResult {
  "dist-tags": {
    latest: string;
  };
}

const MIN_SDK_VERSION = "2.0.0";

export const FUNCTIONS_SDK_VERSION_TOO_OLD_WARNING =
  clc.bold.yellow("functions: ") +
  "You must have a " +
  clc.bold("firebase-functions") +
  " version that is at least 2.0.0. Please run " +
  clc.bold("npm i --save firebase-functions@latest") +
  " in the functions folder.";

/**
 * Returns the version of firebase-functions SDK specified by package.json and package-lock.json.
 * @param sourceDir Source directory of functions code
 * @return version string (e.g. "3.1.2"), or void if firebase-functions is not in package.json
 * or if we had trouble getting the version.
 */
export function getFunctionsSDKVersion(sourceDir: string): string | void {
  try {
    const child = spawn.sync("npm", ["list", "firebase-functions", "--json=true"], {
      cwd: sourceDir,
      encoding: "utf8",
    });
    if (child.error) {
      logger.debug("getFunctionsSDKVersion encountered error:", child.error.stack);
      return;
    }
    const output: NpmListResult = JSON.parse(child.stdout);
    return _.get(output, ["dependencies", "firebase-functions", "version"]);
  } catch (e: any) {
    logger.debug("getFunctionsSDKVersion encountered error:", e);
    return;
  }
}

export function getLatestSDKVersion(): string | undefined {
  const child = spawn.sync("npm", ["show", "firebase-functions", "--json=true"], {
    encoding: "utf8",
  });
  if (child.error) {
    logger.debug(
      "checkFunctionsSDKVersion was unable to fetch information from NPM",
      child.error.stack
    );
    return;
  }
  const output: NpmShowResult = JSON.parse(child.stdout);
  if (_.isEmpty(output)) {
    return;
  }
  return _.get(output, ["dist-tags", "latest"]);
}

/**
 * Checks if firebase-functions SDK is not the latest version in NPM, and prints update notice if it is outdated.
 * If it is unable to do the check, it does nothing.
 * @param sourceDir the location of the customer's source code.
 */
export function checkFunctionsSDKVersion(currentVersion: string): void {
  try {
    if (semver.lt(currentVersion, MIN_SDK_VERSION)) {
      void track("functions_runtime_notices", "functions_sdk_too_old");
      utils.logWarning(FUNCTIONS_SDK_VERSION_TOO_OLD_WARNING);
    }

    // N.B. We must use exports.getLatestSDKVersion so that the method dynamic and we can stub in tests.
    const latest = exports.getLatestSDKVersion();
    if (!latest) {
      return;
    }

    if (semver.eq(currentVersion, latest)) {
      return;
    }
    utils.logWarning(
      clc.bold.yellow("functions: ") +
        "package.json indicates an outdated version of firebase-functions. Please upgrade using " +
        clc.bold("npm install --save firebase-functions@latest") +
        " in your functions directory."
    );
    if (semver.major(currentVersion) < semver.major(latest)) {
      utils.logWarning(
        clc.bold.yellow("functions: ") +
          "Please note that there will be breaking changes when you upgrade."
      );
    }
  } catch (e: any) {
    logger.debug("checkFunctionsSDKVersion encountered error:", e);
    return;
  }
}
