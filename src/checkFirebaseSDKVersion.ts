"use strict";

import * as _ from "lodash";
import * as clc from "cli-color";
import * as path from "path";
import * as semver from "semver";
import { spawnSync } from "child_process";

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

export async function getFunctionsSDKVersion(sourceDir: string): Promise<string | void> {
  try {
    const child = spawnSync("npm", ["list", "firebase-functions", "--json=true"], {
      cwd: sourceDir,
      encoding: "utf8",
    });
    if (child.error) {
      logger.debug(child.error.stack);
      return;
    }
    const output: NpmListResult = JSON.parse(child.stdout);
    return _.get(output, ["dependencies", "firebase-functions", "version"]);
  } catch (e) {
    logger.debug("getFunctionsSDKVersion encountered error:", e);
    return;
  }
}

export async function checkSDKVersion(options: any): Promise<void> {
  if (!options.config.has("functions")) {
    return;
  }

  const sourceDir = path.join(options.config.projectDir, options.config.get("functions.source"));
  const currentVersion = await getFunctionsSDKVersion(sourceDir);
  if (!currentVersion) {
    logger.debug("getFunctionsSDKVersion was unable to retrieve 'firebase-functions' version");
    return;
  }
  try {
    const child = spawnSync("npm", ["show", "firebase-functions", "--json=true"], {
      encoding: "utf8",
    });
    if (child.error) {
      logger.debug(child.error.stack);
      return;
    }
    const output: NpmShowResult = JSON.parse(child.stdout);
    if (!output || _.isEmpty(output)) {
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
    logger.debug("checkSDKVersion encountered error:", e);
    return;
  }
}
