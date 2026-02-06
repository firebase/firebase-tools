import { GoogleAuth, GoogleAuthOptions } from "google-auth-library";
import * as clc from "colorette";

import * as api from "./api";
import * as apiv2 from "./apiv2";
import { FirebaseError } from "./error";
import { logger } from "./logger";
import * as utils from "./utils";
import * as scopes from "./scopes";
import { Tokens, TokensWithExpiration, User } from "./types/auth";
import { setRefreshToken, setActiveAccount, setGlobalDefaultAccount, isExpired } from "./auth";
import type { Options } from "./options";
import { isFirebaseMcp, isFirebaseStudio } from "./env";
import { timeoutError } from "./timeout";

const AUTH_ERROR_MESSAGE = `Command requires authentication, please run ${clc.bold(
  "firebase login",
)}`;

let authClient: GoogleAuth | undefined;
let lastOptions: Options;
/**
 * Returns the auth client.
 * @param config options for the auth client.
 */
function getAuthClient(config: GoogleAuthOptions): GoogleAuth {
  if (authClient) {
    return authClient;
  }

  authClient = new GoogleAuth(config);
  return authClient;
}

/**
 * Retrieves and sets the access token for the current user.
 * Returns account email if found.
 * @param options CLI options.
 * @param authScopes scopes to be obtained.
 */
async function autoAuth(options: Options, authScopes: string[]): Promise<null | string> {
  const client = getAuthClient({ scopes: authScopes, projectId: options.project });
  const token = await client.getAccessToken();
  token !== null ? apiv2.setAccessToken(token) : false;
  logger.debug(`Running auto auth`);

  let clientEmail;
  try {
    const timeoutMillis = isFirebaseMcp() ? 5000 : 15000;
    const credentials = await timeoutError(
      client.getCredentials(),
      new FirebaseError(
        `Authenticating with default credentials timed out after ${timeoutMillis / 1000} seconds. Please try running \`firebase login\` instead.`,
      ),
      timeoutMillis,
    );
    clientEmail = credentials.client_email;
  } catch (e) {
    // Make sure any error here doesn't block the CLI, but log it.
    logger.debug(`Error getting account credentials.`);
  }
  if (isFirebaseStudio() && token && clientEmail) {
    // Within monospace, this a OAuth token for the user, so we make it the active user.
    const activeAccount = {
      user: { email: clientEmail },
      tokens: {
        access_token: token,
        expires_at: client.cachedCredential?.credentials.expiry_date,
      } as TokensWithExpiration,
    };
    setActiveAccount(options, activeAccount);
    setGlobalDefaultAccount(activeAccount);

    // project is also selected in monospace auth flow
    options.projectId = await client.getProjectId();
  }
  return clientEmail || null;
}

export async function refreshAuth(): Promise<Tokens> {
  if (!lastOptions) {
    throw new FirebaseError("Unable to refresh auth: not yet authenticated.");
  }
  await requireAuth(lastOptions);
  return lastOptions.tokens as Tokens;
}

/**
 * Ensures that the user can make authenticated calls. Returns the email if the user is logged in,
 * returns null if the user has Applciation Default Credentials set up, and errors out
 * if the user is not authenticated
 * @param options CLI options.
 */
export async function requireAuth(
  options: any,
  skipAutoAuth: boolean = false,
): Promise<string | null> {
  lastOptions = options;
  const requiredScopes = [scopes.CLOUD_PLATFORM];
  if (isFirebaseStudio()) {
    requiredScopes.push(scopes.USERINFO_EMAIL);
  }
  api.setScopes(requiredScopes);
  options.authScopes = api.getScopes();

  const tokens = options.tokens as Tokens | undefined;
  const user = options.user as User | undefined;
  let tokenOpt = utils.getInheritedOption(options, "token");
  if (tokenOpt) {
    logger.debug("> authorizing via --token option");
    utils.logWarning(
      "Authenticating with `--token` is deprecated and will be removed in a future major version of `firebase-tools`. " +
        "Instead, use a service account key with `GOOGLE_APPLICATION_CREDENTIALS`: https://cloud.google.com/docs/authentication/getting-started",
    );
  } else if (process.env.FIREBASE_TOKEN) {
    logger.debug("> authorizing via FIREBASE_TOKEN environment variable");
    utils.logWarning(
      "Authenticating with `FIREBASE_TOKEN` is deprecated and will be removed in a future major version of `firebase-tools`. " +
        "Instead, use a service account key with `GOOGLE_APPLICATION_CREDENTIALS`: https://cloud.google.com/docs/authentication/getting-started",
    );
  } else if (user && (!isExpired(tokens) || tokens?.refresh_token)) {
    logger.debug(`> authorizing via signed-in user (${user.email})`);
  } else if (skipAutoAuth) {
    return null;
  } else {
    try {
      return await autoAuth(options, options.authScopes);
    } catch (e: any) {
      throw new FirebaseError(
        `Failed to authenticate, have you run ${clc.bold("firebase login")}?`,
        { original: e },
      );
    }
  }

  tokenOpt = tokenOpt || process.env.FIREBASE_TOKEN;

  if (tokenOpt) {
    setRefreshToken(tokenOpt);
    return null;
  }

  if (!user || !tokens) {
    throw new FirebaseError(AUTH_ERROR_MESSAGE);
  }

  // TODO: 90 percent sure this is redundant, as the only time we hit this is if options.user/options.token is set, and
  // setActiveAccount is the only code that sets those.
  setActiveAccount(options, { user, tokens });
  return user.email;
}
