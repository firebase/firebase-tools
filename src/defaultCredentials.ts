import * as fs from "fs";
import * as path from "path";

import * as api from "./api";
import { configstore } from "./configstore";
import * as logger from "./logger";

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
export async function getCredentialPathAsync(): Promise<string | undefined> {
  const filePath = credFilePath();
  if (!filePath) {
    logger.debug("defaultcredentials: could not create path to default credentials file.");
    return undefined;
  }

  const cred = getCredential();
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
export function clearCredentials(): void {
  const filePath = credFilePath();
  if (!filePath) {
    return;
  }

  if (!fs.existsSync(filePath)) {
    return;
  }

  fs.unlinkSync(filePath);
}

function getCredential(): RefreshTokenCredential | undefined {
  const tokens = configstore.get("tokens");
  if (tokens && tokens.refresh_token) {
    return {
      client_id: api.clientId,
      client_secret: api.clientSecret,
      refresh_token: tokens.refresh_token,
      type: "authorized_user",
    };
  }
}

function credFilePath(): string | undefined {
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

  return path.join(fbtConfigDir, `${userEmailSlug()}_application_default_credentials.json`);
}

function userEmailSlug(): string {
  const user = configstore.get("user");
  const email = user && user.email ? user.email : "unknown_user";
  const slug = email.replace("@", "_").replace(".", "_");

  return slug;
}
