"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasDefaultCredentials = exports.clearCredentials = exports.getCredentialPathAsync = void 0;
const fs = require("fs");
const path = require("path");
const google_auth_library_1 = require("google-auth-library");
const api_1 = require("./api");
const logger_1 = require("./logger");
/**
 * Get a path to the application default credentials JSON file.
 */
async function getCredentialPathAsync(account) {
    const filePath = credFilePath(account.user);
    if (!filePath) {
        logger_1.logger.debug("defaultcredentials: could not create path to default credentials file.");
        return undefined;
    }
    const cred = getCredential(account.tokens);
    if (!cred) {
        logger_1.logger.debug("defaultcredentials: no credential available.");
        return undefined;
    }
    // We could use fs.writeFileSync() here but it's important that the caller understands
    // that this is a somewhat expensive operation so we make it a Promise.
    logger_1.logger.debug(`defaultcredentials: writing to file ${filePath}`);
    return new Promise((res, rej) => {
        fs.writeFile(filePath, JSON.stringify(cred, undefined, 2), "utf8", (err) => {
            if (err) {
                rej(err);
            }
            else {
                res(filePath);
            }
        });
    });
}
exports.getCredentialPathAsync = getCredentialPathAsync;
/**
 * Delete the credentials, to be used when logging out.
 */
function clearCredentials(account) {
    const filePath = credFilePath(account.user);
    if (!filePath) {
        return;
    }
    if (!fs.existsSync(filePath)) {
        return;
    }
    fs.unlinkSync(filePath);
}
exports.clearCredentials = clearCredentials;
function getCredential(tokens) {
    if (tokens.refresh_token) {
        return {
            client_id: (0, api_1.clientId)(),
            client_secret: (0, api_1.clientSecret)(),
            refresh_token: tokens.refresh_token,
            type: "authorized_user",
        };
    }
}
function credFilePath(user) {
    // This logic is stolen from firebase-admin-node:
    // https://github.com/firebase/firebase-admin-node/blob/0f6c02e3377c3337e4f206e176b2d96ec6dd6c3c/src/auth/credential.ts#L36
    let configDir = undefined;
    if (process.platform.startsWith("win")) {
        configDir = process.env["APPDATA"];
    }
    else {
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
function userEmailSlug(user) {
    const email = user.email || "unknown_user";
    const slug = email.replace("@", "_").replace(".", "_");
    return slug;
}
async function hasDefaultCredentials() {
    try {
        await google_auth_library_1.auth.getApplicationDefault();
        return true;
    }
    catch (err) {
        return false;
    }
}
exports.hasDefaultCredentials = hasDefaultCredentials;
