"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = exports.refreshAuth = void 0;
const google_auth_library_1 = require("google-auth-library");
const clc = require("colorette");
const api = require("./api");
const apiv2 = require("./apiv2");
const error_1 = require("./error");
const logger_1 = require("./logger");
const utils = require("./utils");
const scopes = require("./scopes");
const auth_1 = require("./auth");
const env_1 = require("./env");
const timeout_1 = require("./timeout");
const AUTH_ERROR_MESSAGE = `Command requires authentication, please run ${clc.bold("firebase login")}`;
let authClient;
let lastOptions;
/**
 * Returns the auth client.
 * @param config options for the auth client.
 */
function getAuthClient(config) {
    if (authClient) {
        return authClient;
    }
    authClient = new google_auth_library_1.GoogleAuth(config);
    return authClient;
}
/**
 * Retrieves and sets the access token for the current user.
 * Returns account email if found.
 * @param options CLI options.
 * @param authScopes scopes to be obtained.
 */
async function autoAuth(options, authScopes) {
    var _a;
    const client = getAuthClient({ scopes: authScopes, projectId: options.project });
    const token = await client.getAccessToken();
    token !== null ? apiv2.setAccessToken(token) : false;
    logger_1.logger.debug(`Running auto auth`);
    let clientEmail;
    try {
        const timeoutMillis = (0, env_1.isFirebaseMcp)() ? 5000 : 15000;
        const credentials = await (0, timeout_1.timeoutError)(client.getCredentials(), new error_1.FirebaseError(`Authenticating with default credentials timed out after ${timeoutMillis / 1000} seconds. Please try running \`firebase login\` instead.`), timeoutMillis);
        clientEmail = credentials.client_email;
    }
    catch (e) {
        // Make sure any error here doesn't block the CLI, but log it.
        logger_1.logger.debug(`Error getting account credentials.`);
    }
    if ((0, env_1.isFirebaseStudio)() && token && clientEmail) {
        // Within monospace, this a OAuth token for the user, so we make it the active user.
        const activeAccount = {
            user: { email: clientEmail },
            tokens: {
                access_token: token,
                expires_at: (_a = client.cachedCredential) === null || _a === void 0 ? void 0 : _a.credentials.expiry_date,
            },
        };
        (0, auth_1.setActiveAccount)(options, activeAccount);
        (0, auth_1.setGlobalDefaultAccount)(activeAccount);
        // project is also selected in monospace auth flow
        options.projectId = await client.getProjectId();
    }
    return clientEmail || null;
}
async function refreshAuth() {
    if (!lastOptions) {
        throw new error_1.FirebaseError("Unable to refresh auth: not yet authenticated.");
    }
    await requireAuth(lastOptions);
    return lastOptions.tokens;
}
exports.refreshAuth = refreshAuth;
/**
 * Ensures that the user can make authenticated calls. Returns the email if the user is logged in,
 * returns null if the user has Applciation Default Credentials set up, and errors out
 * if the user is not authenticated
 * @param options CLI options.
 */
async function requireAuth(options, skipAutoAuth = false) {
    lastOptions = options;
    const requiredScopes = [scopes.CLOUD_PLATFORM];
    if ((0, env_1.isFirebaseStudio)()) {
        requiredScopes.push(scopes.USERINFO_EMAIL);
    }
    api.setScopes(requiredScopes);
    options.authScopes = api.getScopes();
    const tokens = options.tokens;
    const user = options.user;
    let tokenOpt = utils.getInheritedOption(options, "token");
    if (tokenOpt) {
        logger_1.logger.debug("> authorizing via --token option");
        utils.logWarning("Authenticating with `--token` is deprecated and will be removed in a future major version of `firebase-tools`. " +
            "Instead, use a service account key with `GOOGLE_APPLICATION_CREDENTIALS`: https://cloud.google.com/docs/authentication/getting-started");
    }
    else if (process.env.FIREBASE_TOKEN) {
        logger_1.logger.debug("> authorizing via FIREBASE_TOKEN environment variable");
        utils.logWarning("Authenticating with `FIREBASE_TOKEN` is deprecated and will be removed in a future major version of `firebase-tools`. " +
            "Instead, use a service account key with `GOOGLE_APPLICATION_CREDENTIALS`: https://cloud.google.com/docs/authentication/getting-started");
    }
    else if (user && (!(0, auth_1.isExpired)(tokens) || (tokens === null || tokens === void 0 ? void 0 : tokens.refresh_token))) {
        logger_1.logger.debug(`> authorizing via signed-in user (${user.email})`);
    }
    else if (skipAutoAuth) {
        return null;
    }
    else {
        try {
            return await autoAuth(options, options.authScopes);
        }
        catch (e) {
            throw new error_1.FirebaseError(`Failed to authenticate, have you run ${clc.bold("firebase login")}?`, { original: e });
        }
    }
    tokenOpt = tokenOpt || process.env.FIREBASE_TOKEN;
    if (tokenOpt) {
        (0, auth_1.setRefreshToken)(tokenOpt);
        return null;
    }
    if (!user || !tokens) {
        throw new error_1.FirebaseError(AUTH_ERROR_MESSAGE);
    }
    // TODO: 90 percent sure this is redundant, as the only time we hit this is if options.user/options.token is set, and
    // setActiveAccount is the only code that sets those.
    (0, auth_1.setActiveAccount)(options, { user, tokens });
    return user.email;
}
exports.requireAuth = requireAuth;
