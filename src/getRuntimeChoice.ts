import * as _ from "lodash";
import * as path from "path";
import * as clc from "cli-color";
import * as semver from "semver";

import * as FirebaseError from "./error";
import * as logger from "./logger";
import * as utils from "./utils";

// have to require this because no @types/cjson available
// tslint:disable-next-line
var cjson = require("cjson");

export function getRuntimeChoice(sourceDir: string): any {
  const packageJsonPath = path.join(sourceDir, "package.json");
  const loaded = cjson.load(packageJsonPath);
  const choice = loaded.engines;
  if (!choice) {
    return null;
  }

  function nodeVersion(version: string): boolean {
    return _.isEqual(choice, { node: version });
  }

  if (nodeVersion("6")) {
    return _handleNode6();
  } else if (nodeVersion("8")) {
    _checkFunctionsSDKVersion(loaded);
    return _handleNode8();
  } else if (nodeVersion("10")) {
    _checkFunctionsSDKVersion(loaded);
    return _handleNode10();
  }

  const msg = clc.bold(
    `package.json in functions directory has an engines field which is unsupported. ` +
      `The only valid choices are: ${clc.bold('{"node": "8"}')} and ${clc.bold(
        '{"node": "10"}'
      )}. ` +
      `Note that Node.js 6 is now deprecated.`
  );
  throw new FirebaseError(msg, { exit: 1 });
}

function _handleNode8(): string {
  return "nodejs8";
}
function _handleNode10(): string {
  utils.logWarning(
    clc.bold.yellow("functions: ") +
      "Deploying functions to Node 10 runtime which is in Beta. " +
      "Please note that Node 8 is also available and is the recommended runtime."
  );
  return "nodejs10";
}

function _handleNode6(): string {
  utils.logWarning(
    clc.bold.yellow("functions: ") +
      "Deploying functions to Node 6 runtime, which is deprecated. Node 8 is available and is the recommended runtime. "
  );
  return "nodejs6";
}

function _checkFunctionsSDKVersion(loaded: any): void {
  const SDKRange = _.get(loaded, "dependencies.firebase-functions");
  try {
    if (!semver.intersects(SDKRange, ">=2")) {
      utils.logWarning(
        clc.bold.yellow("functions: ") +
          "You must have a " +
          clc.bold("firebase-functions") +
          " version that is at least 2.0.0. Please run " +
          clc.bold("npm i --save firebase-functions@latest") +
          " in the functions folder."
      );
    }
  } catch (e) {
    // do nothing
  }
}
