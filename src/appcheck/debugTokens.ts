import * as os from "os";

import { FirebaseError, getErrStatus } from "../error";
import { createDebugToken, deleteDebugToken } from "./api";
import { saveLocalToken } from "./localConfig";
import { DebugToken } from "./types";

const MAX_DEBUG_TOKENS_PER_APP = 20;
const MAX_DISPLAY_NAME_LENGTH = 50;
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
