import * as fs from "fs";
import * as path from "path";

import { clientId, clientSecret } from "./api";
import { Tokens, User, Account } from "./auth";
import { logger } from "./logger";

// Interface for a valid JSON refresh token credential, so the
// fields must be snake_case not camelCase.
interface RefreshTokenCredential {
  client_id: string; // eslint-disable-line
  client_secret: string; // eslint-disable-line
  refresh_token: string; // eslint-disable-line
  type: string; // eslint-disable-line
}

/**
 * Get a path to the application default credentials JSON file.
 */
export async function getCredentialPathAsync(account: Account): Promise<string | undefined> {
  const filePath = credFilePath(account.user);
  if (!filePath) {
    logger.debug("defaultcredentials: could not create path to default credentials file.");
    return undefined;
  }

  const cred = getCredential(account.tokens);
  if (!cred) {
    logger.debug("defaultcredentials: no credential available.");
    return undefined;
  }

  // We could use fs.writeFileSync() here but it's important that the caller understands
  // that this is a somewhat expensive operation so we make it a Promise.
  logger.debug(`defaultcredentials: writing to file ${filePath}`);
  return new Promise((res, rej) => {
    fs.writeFile(filePath, JSON.stringify(cred, undefined, 2), "utf8", (err) => {
      if (err) {
        rej(err);
      } else {
        res(filePath);
      }
    });
  });
}

/**
 * Delete the credentials, to be used when logging out.
 */
export function clearCredentials(account: Account): void {
  const filePath = credFilePath(account.user);
  if (!filePath) {
    return;
  }

  if (!fs.existsSync(filePath)) {
    return;
  }

  fs.unlinkSync(filePath);
}

function getCredential(tokens: Tokens): RefreshTokenCredential | undefined {
  if (tokens.refresh_token) {
    return {
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: tokens.refresh_token,
      type: "authorized_user",
    };
  }
}

function credFilePath(user: User): string | undefined {
  // This logic is stolen from firebase-admin-node:
  // https://github.com/firebase/firebase-admin-node/blob/0f6c02e3377c3337e4f206e176b2d96ec6dd6c3c/src/auth/credential.ts#L36
  let configDir = undefined;
  if (process.platform.startsWith("win")) {
    configDir = process.env["APPDATA"];
  } else {
    const home = process.env["HOME"];
    if (home) {
      configDir = path.join(home, ".config");
    }
  }

  if (!configDir) {
    return undefined;
  }

  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir);
  }

  const fbtConfigDir = path.join(configDir, "firebase");
  if (!fs.existsSync(fbtConfigDir)) {
    fs.mkdirSync(fbtConfigDir);
  }

  return path.join(fbtConfigDir, `${userEmailSlug(user)}_application_default_credentials.json`);
}

function userEmailSlug(user: User): string {
  const email = user.email || "unknown_user";
  const slug = email.replace("@", "_").replace(".", "_");

  return slug;
}
