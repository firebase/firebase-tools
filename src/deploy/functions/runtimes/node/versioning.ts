import * as fs from "fs";
import * as path from "path";

import * as clc from "colorette";
import * as spawn from "cross-spawn";
import * as semver from "semver";

import { logger } from "../../../../logger";
import * as utils from "../../../../utils";

interface NpmShowResult {
  "dist-tags": {
    latest: string;
  };
}

const MIN_SDK_VERSION = "2.0.0";
const NPM_COMMAND_TIMEOUT_MILLIES = 10000;

export const FUNCTIONS_SDK_VERSION_TOO_OLD_WARNING =
  clc.bold(clc.yellow("functions: ")) +
  "You must have a " +
  clc.bold("firebase-functions") +
  " version that is at least 2.0.0. Please run " +
  clc.bold("npm i --save firebase-functions@latest") +
  " in the functions folder.";

/**
 * Exported for testing purposes only.
 *
 * @internal
 */
export function findModuleVersion(name: string, resolvedPath: string): string | undefined {
  let searchPath = path.dirname(resolvedPath);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (searchPath === "/" || path.basename(searchPath) === "node_modules") {
      logger.debug(
        `Failed to find version of module ${name}: reached end of search path ${searchPath}`,
      );
      return;
    }
    const maybePackageJson = path.join(searchPath, "package.json");
    if (fs.existsSync(maybePackageJson)) {
      const pkg = require(maybePackageJson);
      if (pkg.name === name) {
        return pkg.version;
      }
      logger.debug(
        `Failed to find version of module ${name}: instead found ${pkg.name} at ${searchPath}`,
      );
      return;
    }
    searchPath = path.dirname(searchPath);
  }
}

/**
 * Returns the version of firebase-functions SDK specified by package.json and package-lock.json.
 * @param sourceDir Source directory of functions code
 * @return version string (e.g. "3.1.2"), or void if firebase-functions is not in package.json
 * or if we had trouble getting the version.
 */
export function getFunctionsSDKVersion(sourceDir: string): string | undefined {
  try {
    return findModuleVersion(
      "firebase-functions",
      // Find the entry point of the firebase-function module. require.resolve works for project directories using
      //   npm, yarn (1), or yarn (1) workspaces. Does not support yarn (2) since GCF doesn't support it anyway:
      //   https://issuetracker.google.com/issues/213632942.
      require.resolve("firebase-functions", { paths: [sourceDir] }),
    );
  } catch (e: any) {
    if (e.code === "MODULE_NOT_FOUND") {
      utils.logLabeledWarning(
        "functions",
        "Couldn't find firebase-functions package in your source code. Have you run 'npm install'?",
      );
    }
    logger.debug("getFunctionsSDKVersion encountered error:", e);
    return;
  }
}

/**
 * Get latest version of the Firebase Functions SDK.
 */
export function getLatestSDKVersion(): string | undefined {
  const child = spawn.sync("npm", ["show", "firebase-functions", "--json=true"], {
    encoding: "utf8",
    timeout: NPM_COMMAND_TIMEOUT_MILLIES,
  });
  if (child.error) {
    logger.debug(
      "checkFunctionsSDKVersion was unable to fetch information from NPM",
      child.error.stack,
    );
    return;
  }
  const output: NpmShowResult = JSON.parse(child.stdout);
  if (Object.keys(output).length === 0) {
    return;
  }
  return output["dist-tags"]?.["latest"];
}

/**
 * Checks if firebase-functions SDK is not the latest version in NPM, and prints update notice if it is outdated.
 * If it is unable to do the check, it does nothing.
 * @param sourceDir the location of the customer's source code.
 */
export function checkFunctionsSDKVersion(currentVersion: string): void {
  try {
    if (semver.lt(currentVersion, MIN_SDK_VERSION)) {
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
      clc.bold(clc.yellow("functions: ")) +
        "package.json indicates an outdated version of firebase-functions. Please upgrade using " +
        clc.bold("npm install --save firebase-functions@latest") +
        " in your functions directory.",
    );
    if (semver.major(currentVersion) < semver.major(latest)) {
      utils.logWarning(
        clc.bold(clc.yellow("functions: ")) +
          "Please note that there will be breaking changes when you upgrade.",
      );
    }
  } catch (e: any) {
    logger.debug("checkFunctionsSDKVersion encountered error:", e);
    return;
  }
}
