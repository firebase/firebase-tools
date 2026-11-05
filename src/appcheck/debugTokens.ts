import * as clc from "colorette";
import * as os from "os";

import { FirebaseError, getErrMsg, getErrStatus } from "../error";
import { logger } from "../logger";
import { AppPlatform, listFirebaseApps } from "../management/apps";
import { getProjectId, needProjectId, needProjectNumber } from "../projectUtils";
import { requireAuth } from "../requireAuth";
import { createDebugToken, deleteDebugToken, listDebugTokens } from "./api";
import {
  getAllLocalTokenNames,
  getAllLocalTokens,
  getLocalToken,
  saveLocalToken,
} from "./localConfig";
import {
  AppCheckDebugOptions,
  DebugToken,
  LocalDebugTokenEntry,
  LocalDebugTokenStatus,
} from "./types";

const MAX_DEBUG_TOKENS_PER_APP = 20;
const MAX_DISPLAY_NAME_LENGTH = 50;
const MASK_PREFIX_LENGTH = 8;
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const GMP_APP_ID_PROJECT_NUMBER_REGEX = /^\d+:(\d+):/;

function extractProjectNumberFromAppId(appId: string): string | undefined {
  const match = GMP_APP_ID_PROJECT_NUMBER_REGEX.exec(appId);
  return match ? match[1] : undefined;
}

function maskDebugToken(token: string): string {
  if (token.length <= MASK_PREFIX_LENGTH) {
    return "********";
  }
  const prefix = token.slice(0, MASK_PREFIX_LENGTH);
  return token[MASK_PREFIX_LENGTH] === "-" ? `${prefix}-...` : `${prefix}...`;
}

async function deleteServerTokensIgnoringNotFound(tokens: readonly DebugToken[]): Promise<void> {
  for (const existing of tokens) {
    try {
      await deleteDebugToken(existing.name);
    } catch (err: unknown) {
      if (getErrStatus(err) !== 404) {
        throw err;
      }
    }
  }
}

async function checkAppServerTokenStatus(
  projectNumber: string,
  appId: string,
  recordedResourceName?: string,
): Promise<LocalDebugTokenStatus> {
  let serverTokens: DebugToken[];
  try {
    serverTokens = await listDebugTokens(projectNumber, appId);
  } catch (err: unknown) {
    const status = getErrStatus(err);
    // App Check returns 404 when an app does not exist and 409 ABORTED when an app's row is hidden/pending deletion.
    if (status === 404 || status === 409) {
      return "APP_DELETED";
    }
    throw err;
  }

  if (serverTokens.length === 0) {
    return "REVOKED";
  }
  if (recordedResourceName) {
    return serverTokens.some((t) => t.name === recordedResourceName) ? "ACTIVE" : "REVOKED";
  }
  return "UNCHECKED";
}

async function resolveProjectTokenStatuses(params: {
  projectId: string;
  projectNumber: string;
  candidateAppIds: readonly string[];
  tokenNames: Readonly<Record<string, string>>;
}): Promise<Record<string, LocalDebugTokenStatus>> {
  const { projectId, projectNumber, candidateAppIds, tokenNames } = params;
  const statuses: Record<string, LocalDebugTokenStatus> = {};
  if (candidateAppIds.length === 0) {
    return statuses;
  }

  const apps = await listFirebaseApps(projectId, AppPlatform.ANY);
  const activeProjectAppIds = new Set(apps.map((app) => app.appId));

  await Promise.all(
    candidateAppIds.map(async (appId) => {
      if (!activeProjectAppIds.has(appId)) {
        statuses[appId] = "APP_DELETED";
        return;
      }
      try {
        statuses[appId] = await checkAppServerTokenStatus(projectNumber, appId, tokenNames[appId]);
      } catch (err: unknown) {
        logger.debug(`Failed to check server token status for app ${appId}: ${getErrMsg(err)}`);
        statuses[appId] = "UNCHECKED";
      }
    }),
  );

  return statuses;
}

function buildLocalTokenEntry(params: {
  appId: string;
  token: string;
  status: LocalDebugTokenStatus;
  resourceName?: string;
}): LocalDebugTokenEntry {
  const { appId, token, status, resourceName } = params;
  const entry: LocalDebugTokenEntry = {
    appId,
    tokenPrefix: maskDebugToken(token),
    status,
  };
  if (resourceName) {
    entry.name = resourceName;
  }
  return entry;
}

/**
 * Returns an error message when `raw` is not a valid UUID v4 debug token, or `undefined` if valid.
 */
export function getDebugTokenValidationError(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) {
    return "Debug token cannot be empty.";
  }
  if (!UUID_V4_REGEX.test(trimmed)) {
    return (
      `Invalid debug token "${trimmed}". Expected a UUID v4 string ` +
      `(for example, xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx). To specify a Firebase App ID, pass --app <appId>.`
    );
  }
  return undefined;
}

/**
 * Trims and validates a UUID v4 debug token, throwing a `FirebaseError` if invalid.
 */
export function validateDebugTokenUuid(raw: string): string {
  const error = getDebugTokenValidationError(raw);
  if (error) {
    throw new FirebaseError(error, { exit: 1 });
  }
  return raw.trim();
}

/**
 * Returns an error message when `raw` is not a valid debug token display name (`1..50` chars), or `undefined` if valid.
 */
export function getDisplayNameValidationError(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) {
    return "Display name cannot be empty.";
  }
  if (trimmed.length > MAX_DISPLAY_NAME_LENGTH) {
    return (
      `Display name "${trimmed}" exceeds the maximum length of ${MAX_DISPLAY_NAME_LENGTH} characters ` +
      `(got ${trimmed.length}). Pass a shorter --display-name.`
    );
  }
  return undefined;
}

/**
 * Trims and validates a debug token display name against backend length constraints (`<= 50` chars).
 */
export function validateDisplayName(raw: string): string {
  const error = getDisplayNameValidationError(raw);
  if (error) {
    throw new FirebaseError(error, { exit: 1 });
  }
  return raw.trim();
}

/**
 * Builds the default display name for a debug token, bounded to the backend's 50-character limit.
 *
 * When `saveLocal` is `true`, uses `<username>@<hostname>` (falling back to the short hostname if
 * the FQDN would exceed 50 characters). When `saveLocal` is `false` (`--no-save-local`), uses
 * `CLI Debug Token (<shortHost>)` so provisioning a remote/CI token never collides with and revokes
 * the host machine's own local token.
 */
export function getDefaultDisplayName(saveLocal = true): string {
  const fullHost = os.hostname() || "unknown-host";
  const shortHost = fullHost.split(".")[0] || fullHost;

  if (!saveLocal) {
    return `CLI Debug Token (${shortHost})`.slice(0, MAX_DISPLAY_NAME_LENGTH);
  }

  let username = "user";
  try {
    const info = os.userInfo();
    if (info.username) {
      username = info.username;
    }
  } catch {
    // os.userInfo() can throw a SystemError in restricted container environments without a passwd entry.
  }

  const fullCandidate = `${username}@${fullHost}`;
  if (fullCandidate.length <= MAX_DISPLAY_NAME_LENGTH) {
    return fullCandidate;
  }
  return `${username}@${shortHost}`.slice(0, MAX_DISPLAY_NAME_LENGTH);
}

/**
 * Returns whether a Firebase GMP App ID targets the Web platform.
 */
export function isWebAppId(appId: string): boolean {
  return appId.toLowerCase().includes(":web:");
}

/**
 * Formats a `LocalDebugTokenStatus` value for human-readable CLI output.
 */
export function formatLocalTokenStatus(status: LocalDebugTokenStatus): string {
  switch (status) {
    case "ACTIVE":
      return clc.green("Active");
    case "REVOKED":
      return clc.yellow("Revoked");
    case "APP_DELETED":
      return clc.red("App Deleted");
    case "UNCHECKED":
      return clc.gray("Unchecked");
  }
}

/**
 * Verifies that creating (or overwriting) a debug token will not exceed the 20-token per-app backend limit.
 */
export function ensureCanCreateOrOverwriteDebugToken(params: {
  appId: string;
  existingTokens: readonly DebugToken[];
  matchingTokens: readonly DebugToken[];
}): void {
  const { appId, existingTokens, matchingTokens } = params;
  if (matchingTokens.length === 0 && existingTokens.length >= MAX_DEBUG_TOKENS_PER_APP) {
    throw new FirebaseError(
      `App ${appId} already has the maximum of ${MAX_DEBUG_TOKENS_PER_APP} debug tokens. ` +
        `View existing tokens with "firebase appcheck:debugtokens:list --app ${appId}" and ` +
        `revoke unused tokens with "firebase appcheck:debugtokens:delete <debugTokenId>".`,
      { exit: 1 },
    );
  }
}

/**
 * Registers a debug token on the App Check backend, safely replacing any `matchingTokens`
 * and optionally persisting the token and its resource name to `~/.config/configstore/firebase-appcheck.json`.
 */
export async function provisionDebugToken(params: {
  projectNumber: string;
  appId: string;
  displayName: string;
  token: string;
  existingTokens: readonly DebugToken[];
  matchingTokens: readonly DebugToken[];
  saveLocal: boolean;
}): Promise<DebugToken> {
  const { projectNumber, appId, displayName, token, existingTokens, matchingTokens, saveLocal } =
    params;
  ensureCanCreateOrOverwriteDebugToken({ appId, existingTokens, matchingTokens });

  const mustDeleteBeforeCreate =
    matchingTokens.length > 0 && existingTokens.length >= MAX_DEBUG_TOKENS_PER_APP;
  if (mustDeleteBeforeCreate) {
    await deleteServerTokensIgnoringNotFound(matchingTokens);
  }

  const created = await createDebugToken(projectNumber, appId, displayName, token);

  if (matchingTokens.length > 0 && !mustDeleteBeforeCreate) {
    await deleteServerTokensIgnoringNotFound(matchingTokens);
  }

  // The App Check CreateDebugToken API clears the secret `token` field in its response;
  // re-attach the registered UUID so `--json` callers receive it.
  const finalToken = created.token || token;
  const hydrated: DebugToken = {
    ...created,
    token: finalToken,
  };

  if (saveLocal) {
    saveLocalToken(appId, finalToken, hydrated.name);
  }

  return hydrated;
}

/**
 * Lists locally stored debug tokens (optionally filtered by `--app`), enriching entries belonging
 * to the active Firebase project with their live server status when authenticated.
 */
export async function inspectLocalDebugTokens(
  options: Partial<AppCheckDebugOptions>,
): Promise<LocalDebugTokenEntry[]> {
  let tokens: Record<string, string>;
  if (options.app) {
    const single = getLocalToken(options.app);
    tokens = single ? { [options.app]: single } : {};
  } else {
    tokens = getAllLocalTokens();
  }

  const appIds = Object.keys(tokens);
  if (appIds.length === 0) {
    return [];
  }

  const tokenNames = getAllLocalTokenNames();
  const statusByAppId: Record<string, LocalDebugTokenStatus> = {};
  for (const appId of appIds) {
    statusByAppId[appId] = "UNCHECKED";
  }

  if (getProjectId(options) || options.projectNumber) {
    try {
      await requireAuth(options);
      const projectId = needProjectId(options);
      const projectNumber = await needProjectNumber(options);
      const candidateAppIds = appIds.filter(
        (appId) => extractProjectNumberFromAppId(appId) === projectNumber,
      );
      const resolvedStatuses = await resolveProjectTokenStatuses({
        projectId,
        projectNumber,
        candidateAppIds,
        tokenNames,
      });
      Object.assign(statusByAppId, resolvedStatuses);
    } catch (err: unknown) {
      logger.debug(
        `Skipping server status check for local App Check debug tokens: ${getErrMsg(err)}`,
      );
    }
  }

  return appIds.map((appId) =>
    buildLocalTokenEntry({
      appId,
      token: tokens[appId],
      status: statusByAppId[appId],
      resourceName: tokenNames[appId],
    }),
  );
}
