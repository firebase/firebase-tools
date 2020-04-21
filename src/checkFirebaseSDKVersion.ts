import * as _ from "lodash";
import * as clc from "cli-color";
import * as path from "path";
import * as semver from "semver";
import * as spawn from "cross-spawn";

import * as utils from "./utils";
import * as logger from "./logger";

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
  } catch (e) {
    logger.debug("getFunctionsSDKVersion encountered error:", e);
    return;
  }
}

/**
 * Checks if firebase-functions SDK is not the latest version in NPM, and prints update notice if it is outdated.
 * If it is unable to do the check, it does nothing.
 * @param options Options object from "firebase deploy" command.
 */
export function checkFunctionsSDKVersion(options: any): void {
  if (!options.config.has("functions")) {
    return;
  }

  const sourceDir = path.join(options.config.projectDir, options.config.get("functions.source"));
  const currentVersion = getFunctionsSDKVersion(sourceDir);
  if (!currentVersion) {
    logger.debug("getFunctionsSDKVersion was unable to retrieve 'firebase-functions' version");
    return;
  }
  try {
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
    const latest = _.get(output, ["dist-tags", "latest"]);

    if (semver.lt(currentVersion, latest)) {
      utils.logWarning(
        clc.bold.yellow("functions: ") +
          "package.json indicates an outdated version of firebase-functions.\nPlease upgrade using " +
          clc.bold("npm install --save firebase-functions@latest") +
          " in your functions directory."
      );
      if (semver.satisfies(currentVersion, "0.x") && semver.satisfies(latest, "1.x")) {
        utils.logWarning(
          clc.bold.yellow("functions: ") +
            "Please note that there will be breaking changes when you upgrade.\n Go to " +
            clc.bold("https://firebase.google.com/docs/functions/beta-v1-diff") +
            " to learn more."
        );
      }
    }
  } catch (e) {
    logger.debug("checkFunctionsSDKVersion encountered error:", e);
    return;
  }
}
