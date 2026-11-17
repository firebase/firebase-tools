import * as Configstore from "configstore";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { FirebaseError, getErrMsg, isObject } from "../error";

const CONFIGSTORE_ID = "firebase-appcheck";
const WARNING_COMMENT =
  "This file contains secrets and should not be committed to source repositories";
const FORBIDDEN_KEYS: ReadonlySet<string> = new Set(["__proto__", "constructor", "prototype"]);
const MANAGED_TOP_LEVEL_KEYS: ReadonlySet<string> = new Set(["_comment", "tokens", "tokenNames"]);

interface ParsedLocalConfig {
  tokens: Record<string, string>;
  tokenNames: Record<string, string>;
  extraFields: Record<string, unknown>;
}

function getCanonicalConfigDir(): string {
  return path.join(os.homedir(), ".config");
}

function areSameDirectory(dirA: string, dirB: string): boolean {
  const resolvedA = path.resolve(dirA);
  const resolvedB = path.resolve(dirB);
  const caseInsensitive = process.platform === "win32" || process.platform === "darwin";
  if (
    caseInsensitive ? resolvedA.toLowerCase() === resolvedB.toLowerCase() : resolvedA === resolvedB
  ) {
    return true;
  }
  try {
    if (fs.existsSync(resolvedA) && fs.existsSync(resolvedB)) {
      return fs.realpathSync(resolvedA) === fs.realpathSync(resolvedB);
    }
  } catch {
    // Ignore transient filesystem errors when probing realpath equivalence.
  }
  return false;
}

function getConfigStorePaths(): string[] {
  const canonicalDir = getCanonicalConfigDir();
  const canonicalPath = path.join(canonicalDir, "configstore", `${CONFIGSTORE_ID}.json`);
  const xdgConfigHome = process.env.XDG_CONFIG_HOME?.trim();
  // Per the XDG Base Directory Specification, relative paths in XDG_CONFIG_HOME
  // must be ignored so secrets are never written into the current working directory.
  if (
    xdgConfigHome &&
    path.isAbsolute(xdgConfigHome) &&
    !areSameDirectory(xdgConfigHome, canonicalDir)
  ) {
    const xdgPath = path.join(xdgConfigHome, "configstore", `${CONFIGSTORE_ID}.json`);
    return [canonicalPath, xdgPath];
  }
  return [canonicalPath];
}

function extractStringRecord(raw: unknown): Record<string, string> {
  if (!isObject(raw) || Array.isArray(raw)) {
    return {};
  }
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (FORBIDDEN_KEYS.has(key)) {
      continue;
    }
    if (typeof value === "string" && value.length > 0) {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Reads and parses a config file directly rather than via `Configstore.all`,
 * because `Configstore`'s getter overwrites files with 0 bytes on JSON `SyntaxError`.
 */
function readConfigFile(configPath: string): Record<string, unknown> | undefined {
  let content: string;
  try {
    content = fs.readFileSync(configPath, "utf8");
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") {
      return undefined;
    }
    throw new FirebaseError(
      `Failed to read local App Check config at ${configPath}: ${getErrMsg(err)}`,
      { exit: 1, original: err instanceof Error ? err : undefined },
    );
  }

  if (!content.trim()) {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (err: unknown) {
    throw new FirebaseError(
      `Failed to parse local App Check config at ${configPath}: ${getErrMsg(err)}. Fix or delete the file and try again.`,
      { exit: 1, original: err instanceof Error ? err : undefined },
    );
  }

  if (!isObject(parsed) || Array.isArray(parsed)) {
    throw new FirebaseError(
      `Invalid local App Check config at ${configPath}: expected a top-level JSON object.`,
      { exit: 1 },
    );
  }
  return parsed;
}

function readMergedConfig(): ParsedLocalConfig {
  const tokens: Record<string, string> = {};
  const tokenNames: Record<string, string> = {};
  const extraFields: Record<string, unknown> = {};
  const paths = getConfigStorePaths();

  // `~/.config` is the primary location that SDKs and build plugins read (the iOS Simulator via
  // SIMULATOR_HOST_HOME, Gradle via user.home), and `$XDG_CONFIG_HOME` is a mirror of it. Read in
  // reverse order so the primary `~/.config` copy wins if the two files diverge.
  for (let i = paths.length - 1; i >= 0; i--) {
    const raw = readConfigFile(paths[i]);
    if (!raw) {
      continue;
    }
    for (const [key, value] of Object.entries(raw)) {
      if (!MANAGED_TOP_LEVEL_KEYS.has(key) && !FORBIDDEN_KEYS.has(key)) {
        extraFields[key] = value;
      }
    }
    Object.assign(tokens, extractStringRecord(raw.tokens));
    Object.assign(tokenNames, extractStringRecord(raw.tokenNames));
  }

  for (const appId of Object.keys(tokenNames)) {
    if (!Object.prototype.hasOwnProperty.call(tokens, appId)) {
      delete tokenNames[appId];
    }
  }

  return { tokens, tokenNames, extraFields };
}

function writeLocalConfig(config: ParsedLocalConfig): void {
  const payload: Record<string, unknown> = {
    ...config.extraFields,
    _comment: WARNING_COMMENT,
    tokens: config.tokens,
  };
  if (Object.keys(config.tokenNames).length > 0) {
    payload.tokenNames = config.tokenNames;
  }

  for (const configPath of getConfigStorePaths()) {
    const store = new Configstore(CONFIGSTORE_ID, undefined, { configPath });
    store.all = payload;
    try {
      fs.chmodSync(configPath, 0o600);
    } catch {
      // Ignore on filesystems/platforms that do not support POSIX file modes.
    }
  }
}

/**
 * Returns the canonical path to `~/.config/configstore/firebase-appcheck.json`.
 */
export function getLocalConfigPath(): string {
  return path.join(getCanonicalConfigDir(), "configstore", `${CONFIGSTORE_ID}.json`);
}

/**
 * Reads all App Check debug tokens stored locally on this machine.
 */
export function getAllLocalTokens(): Record<string, string> {
  return readMergedConfig().tokens;
}

/**
 * Reads all server DebugToken resource names recorded for locally stored App IDs.
 */
export function getAllLocalTokenNames(): Record<string, string> {
  return readMergedConfig().tokenNames;
}

/**
 * Returns the locally stored debug token for `appId`, or `undefined` if not present.
 */
export function getLocalToken(appId: string): string | undefined {
  if (FORBIDDEN_KEYS.has(appId)) {
    return undefined;
  }
  const tokens = getAllLocalTokens();
  return Object.prototype.hasOwnProperty.call(tokens, appId) ? tokens[appId] : undefined;
}

/**
 * Returns the recorded server DebugToken resource name for `appId`, or `undefined` if not recorded.
 */
export function getLocalTokenName(appId: string): string | undefined {
  if (FORBIDDEN_KEYS.has(appId)) {
    return undefined;
  }
  const tokenNames = getAllLocalTokenNames();
  return Object.prototype.hasOwnProperty.call(tokenNames, appId) ? tokenNames[appId] : undefined;
}

/**
 * Saves an App Check debug token (and optional server resource name) for `appId`
 * to the local machine config, mirroring to `$XDG_CONFIG_HOME` when distinct from `~/.config`.
 */
export function saveLocalToken(appId: string, token: string, resourceName?: string): void {
  if (!appId || FORBIDDEN_KEYS.has(appId)) {
    throw new FirebaseError(`Invalid Firebase App ID "${appId}".`, { exit: 1 });
  }
  const config = readMergedConfig();
  config.tokens[appId] = token;
  if (resourceName) {
    config.tokenNames[appId] = resourceName;
  } else {
    delete config.tokenNames[appId];
  }
  writeLocalConfig(config);
}

/**
 * Removes locally stored debug tokens (and any recorded resource names) for the specified `appIds`.
 */
export function removeLocalTokens(appIds: readonly string[]): void {
  if (appIds.length === 0) {
    return;
  }
  const config = readMergedConfig();
  let modified = false;
  for (const appId of appIds) {
    if (FORBIDDEN_KEYS.has(appId)) {
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(config.tokens, appId)) {
      delete config.tokens[appId];
      delete config.tokenNames[appId];
      modified = true;
    }
  }
  if (modified) {
    writeLocalConfig(config);
  }
}
