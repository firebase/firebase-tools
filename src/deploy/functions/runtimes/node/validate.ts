import * as path from "path";
import * as fs from "fs";
import * as spawn from "cross-spawn";

import { FirebaseError } from "../../../../error";
import { logger } from "../../../../logger";
import * as fsutils from "../../../../fsutils";
import * as utils from "../../../../utils";

const NPM_COMMAND_TIMEOUT_MILLIES = 10000;

// have to require this because no @types/cjson available
// tslint:disable-next-line
const cjson = require("cjson");

/**
 * Asserts that functions source directory exists and source file is present.
 * @param data Object representing package.json file.
 * @param sourceDir Directory for the functions source.
 * @param projectDir Project directory.
 * @throws { FirebaseError } Functions source directory and source file must exist.
 */
function assertFunctionsSourcePresent(data: any, sourceDir: string, projectDir: string): void {
  const indexJsFile = path.join(sourceDir, data.main || "index.js");
  if (!fsutils.fileExistsSync(indexJsFile)) {
    const relativeMainPath = path.relative(projectDir, indexJsFile);
    const msg = `${relativeMainPath} does not exist, can't deploy Cloud Functions`;
    throw new FirebaseError(msg);
  }
}

/**
 * Validate contents of package.json to ensure main file is present.
 * @param sourceDirName Name of source directory.
 * @param sourceDir Relative path of source directory.
 * @param projectDir Relative path of project directory.
 * @param hasRuntimeConfigInConfig Whether the runtime was chosen in the `functions` section of firebase.json.
 * @throws { FirebaseError } Package.json must be present and valid.
 */
export function packageJsonIsValid(
  sourceDirName: string,
  sourceDir: string,
  projectDir: string,
): void {
  const packageJsonFile = path.join(sourceDir, "package.json");
  if (!fsutils.fileExistsSync(packageJsonFile)) {
    const msg = `No npm package found in functions source directory ${sourceDirName}.`;
    throw new FirebaseError(msg);
  }

  let data;
  try {
    data = cjson.load(packageJsonFile);
    logger.debug("> [functions] package.json contents:", JSON.stringify(data, null, 2));
    assertFunctionsSourcePresent(data, sourceDir, projectDir);
  } catch (e: any) {
    const msg = `There was an error reading ${sourceDirName}${path.sep}package.json:\n\n ${e.message}`;
    throw new FirebaseError(msg);
  }
}

/**
 * Returns true if the source dir ships an .npmrc that pins legacy-peer-deps.
 *
 * .npmrc is not ignored when we package the source, so a project-level setting
 * travels with the upload and the build server's npm honors it.
 */
function shipsLegacyPeerDepsSetting(sourceDir: string): boolean {
  const npmrc = path.join(sourceDir, ".npmrc");
  if (!fsutils.fileExistsSync(npmrc)) {
    return false;
  }
  try {
    return /^\s*legacy-peer-deps\s*=/m.test(fs.readFileSync(npmrc, "utf8"));
  } catch (e: any) {
    logger.debug("Failed to read .npmrc in functions source directory:", e.message);
    return false;
  }
}

/**
 * Warns when a lockfile was resolved with legacy-peer-deps but the setting won't
 * reach the build server.
 *
 * The Cloud Functions builder runs `npm ci` with npm's default
 * legacy-peer-deps=false. A lockfile written with the setting on omits the peer
 * dependencies npm would otherwise install, so the build fails with
 * "Missing: <package> from lock file" even though the local install succeeded.
 * @param sourceDir Absolute path of the functions source directory.
 */
export function warnIfLegacyPeerDepsMismatch(sourceDir: string): void {
  if (!fsutils.fileExistsSync(path.join(sourceDir, "package-lock.json"))) {
    // Without a lockfile the builder falls back to `npm install` and resolves remotely.
    return;
  }
  if (shipsLegacyPeerDepsSetting(sourceDir)) {
    return;
  }

  const child = spawn.sync("npm", ["config", "get", "legacy-peer-deps"], {
    cwd: sourceDir,
    encoding: "utf8",
    timeout: NPM_COMMAND_TIMEOUT_MILLIES,
  });
  if (child.error || child.status !== 0) {
    logger.debug("Unable to read npm's legacy-peer-deps setting:", child.error?.message);
    return;
  }
  if (child.stdout?.trim() !== "true") {
    return;
  }

  utils.logLabeledWarning(
    "functions",
    "Your npm is configured with legacy-peer-deps=true, but the Cloud Functions " +
      "build server is not. Your package-lock.json omits peer dependencies that the " +
      "build server expects, so `npm ci` may fail there with " +
      '"Missing: <package> from lock file".\n' +
      "To keep both resolving the same way, either add legacy-peer-deps=true to " +
      `${path.join(sourceDir, ".npmrc")}, or run \`npm config set legacy-peer-deps false\` ` +
      "and regenerate package-lock.json with `npm install`.",
  );
}
