"use strict";

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

export async function getFunctionsSDKVersion(sourceDir: string): Promise<string | void> {
  try {
    let output: NpmListResult;
    const child = spawn("npm", ["list", "firebase-functions", "--json=true"], {
      cwd: sourceDir,
    });

    child.on("error", function(err: Error) {
      logger.debug(err.stack);
      return;
    });

    child.stdout.on("data", function(data: any) {
      output = JSON.parse(data.toString("utf8"));
    });

    child.on("exit", function() {
      return _.get(output, "dependencies.firebase-functions.version");
    });
  } catch (e) {
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
    return;
  }
  try {
    let output: NpmShowResult;
    let child = spawn("npm", ["show", "firebase-functions", "--json=true"]);

    child.on("error", function(err) {
      logger.debug(err.stack);
      return;
    });

    child.stdout.on("data", function(data) {
      output = JSON.parse(data.toString("utf8"));
    });

    child.on("exit", function() {
      if (!output || _.isEmpty(output)) {
        return;
      }
      let latest = output["dist-tags"].latest;

      if (semver.lt(currentVersion, latest)) {
        utils.logWarning(
          clc.bold.yellow("functions: ") +
            "package.json indicates an outdated version of firebase-functions.\n Please upgrade using " +
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
    });
  } catch (e) {
    // Do nothing.
    return;
  }
}
