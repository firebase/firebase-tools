import * as path from "path";
import * as fs from "fs";
import * as minimatch from "minimatch";

import { FirebaseError } from "../../../../error";
import { logger } from "../../../../logger";
import * as fsutils from "../../../../fsutils";
import * as utils from "../../../../utils";

// `npm ci` accepts either, so either can be the artifact that fails the build.
const LOCKFILES = ["package-lock.json", "npm-shrinkwrap.json"];

// Enough to identify the problem without printing a wall of names.
const MAX_REPORTED_PEERS = 5;

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

/** The subset of a lockfile's `packages` map that we care about. */
interface LockfileEntry {
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
}

interface Lockfile {
  packages?: Record<string, LockfileEntry>;
}

/**
 * Reads the effective value of legacy-peer-deps from .npmrc contents.
 * @param contents Raw text of an .npmrc file.
 * @return The configured value, or undefined if the file does not set it.
 */
export function parseLegacyPeerDeps(contents: string): boolean | undefined {
  let value: boolean | undefined;
  for (const line of contents.split("\n")) {
    // npm treats both ; and # as comment markers.
    const setting = line.split(/[;#]/)[0];
    const match = /^\s*legacy-peer-deps\s*(?:=\s*(.*?))?\s*$/.exec(setting);
    if (!match) {
      continue;
    }
    // ini reads a bare key as true, and strips quotes around a value.
    const raw = (match[1] ?? "true").replace(/^(["'])(.*)\1$/, "$2").toLowerCase();
    // Last assignment wins, as it does in npm, which coerces anything that is
    // neither empty nor "false" to true.
    value = raw !== "" && raw !== "false";
  }
  return value;
}

/**
 * Returns true if the source dir ships an .npmrc turning legacy-peer-deps on.
 *
 * Such an .npmrc travels with the upload and the build server's npm honors it,
 * so the build resolves the same way the developer's install did.
 * @param sourceDir Absolute path of the functions source directory.
 * @param ignore The codebase's configured ignore globs, which may exclude .npmrc.
 */
function shipsLegacyPeerDeps(sourceDir: string, ignore: string[]): boolean {
  // Same options the packaging code matches ignore globs with, so we agree with
  // it about whether the file is actually uploaded.
  if (ignore.some((glob) => minimatch(".npmrc", glob, { matchBase: true, dot: true }))) {
    // Configured out of the upload, so whatever it says never reaches the build.
    return false;
  }
  const npmrc = path.join(sourceDir, ".npmrc");
  if (!fsutils.fileExistsSync(npmrc)) {
    return false;
  }
  return parseLegacyPeerDeps(fs.readFileSync(npmrc, "utf8")) === true;
}

/**
 * Finds peer dependencies the lockfile requires but does not contain.
 *
 * npm satisfies a peer by walking up node_modules from the dependent, so we
 * resolve each peer the same way against the lockfile's `packages` map.
 * Names only, so it does not check that a present peer satisfies the required
 * range, and it only walks peers of packages the lockfile already contains.
 * Both are fine for an advisory warning, which does not aim to reproduce
 * `npm ci`.
 * @param lockfile Parsed package-lock.json or npm-shrinkwrap.json.
 * @return Sorted names of missing peers, empty if none were found.
 */
export function findMissingPeerDeps(lockfile: Lockfile): string[] {
  const packages = lockfile.packages;
  if (!packages) {
    // lockfileVersion 1 has no package metadata to check.
    return [];
  }
  const missing = new Set<string>();
  for (const [dir, entry] of Object.entries(packages)) {
    for (const peer of Object.keys(entry?.peerDependencies ?? {})) {
      if (entry.peerDependenciesMeta?.[peer]?.optional) {
        continue;
      }
      let prefix = dir;
      let found = false;
      for (;;) {
        const candidate = prefix ? `${prefix}/node_modules/${peer}` : `node_modules/${peer}`;
        if (candidate in packages) {
          found = true;
          break;
        }
        if (!prefix) {
          break;
        }
        // Walk one directory up, whether or not it is a node_modules boundary.
        const parent = prefix.lastIndexOf("/");
        prefix = parent === -1 ? "" : prefix.slice(0, parent);
      }
      if (!found) {
        missing.add(peer);
      }
    }
  }
  return [...missing].sort();
}

/**
 * Warns when the lockfile we are about to upload omits peer dependencies.
 *
 * The build server runs `npm ci` with npm's default legacy-peer-deps=false. A
 * lockfile resolved with the setting on omits the peers npm would otherwise
 * install, so the build fails with "Missing: <package> from lock file" even
 * though the local install succeeded. Reading the lockfile catches this however
 * the setting was applied, including a one-off `npm install --legacy-peer-deps`
 * that leaves no trace in npm's config.
 *
 * Advisory only: never throws, so it can never fail a deploy that would
 * otherwise have worked.
 * @param sourceDir Absolute path of the functions source directory.
 * @param ignore The codebase's configured ignore globs.
 */
export function warnIfLockfileOmitsPeerDeps(sourceDir: string, ignore: string[] = []): void {
  try {
    const lockfilePath = LOCKFILES.map((f) => path.join(sourceDir, f)).find((f) =>
      fsutils.fileExistsSync(f),
    );
    if (!lockfilePath) {
      // Without a lockfile the builder falls back to `npm install` and resolves remotely.
      return;
    }

    const missing = findMissingPeerDeps(JSON.parse(fs.readFileSync(lockfilePath, "utf8")));
    if (missing.length === 0) {
      return;
    }
    if (shipsLegacyPeerDeps(sourceDir, ignore)) {
      // The build server will resolve the same way the lockfile was written.
      return;
    }

    const named = missing.slice(0, MAX_REPORTED_PEERS).join(", ");
    const rest = missing.length - MAX_REPORTED_PEERS;
    utils.logLabeledWarning(
      "functions",
      `${path.basename(lockfilePath)} is missing peer dependencies that the Cloud Functions ` +
        `build server expects: ${named}${rest > 0 ? `, and ${rest} more` : ""}.\n` +
        "This usually means it was resolved with legacy-peer-deps enabled, which the build " +
        'server does not use, so `npm ci` may fail there with "Missing: <package> from lock ' +
        'file".\n' +
        "To fix it, regenerate the lockfile with `npm install` and legacy-peer-deps off. To " +
        "keep resolving this way instead, add an .npmrc to your functions directory containing " +
        "only legacy-peer-deps=true, since that file is uploaded with your source.",
    );
  } catch (err: unknown) {
    // A warning is never worth failing a deploy over.
    logger.debug("Unable to check the functions lockfile for missing peer dependencies:", err);
  }
}
