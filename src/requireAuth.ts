import { GoogleAuth, GoogleAuthOptions } from "google-auth-library";
import * as clc from "colorette";

import * as api from "./api";
import * as apiv2 from "./apiv2";
import { FirebaseError } from "./error";
import { logger } from "./logger";
import * as utils from "./utils";
import * as scopes from "./scopes";
import { Tokens, User } from "./types/auth";
import { setRefreshToken, setActiveAccount } from "./auth";

const AUTH_ERROR_MESSAGE = `Command requires authentication, please run ${clc.bold(
  "firebase login"
)}`;

let authClient: GoogleAuth | undefined;

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
 * @param options CLI options.
 * @param authScopes scopes to be obtained.
 */
async function autoAuth(options: any, authScopes: string[]): Promise<void> {
  const client = getAuthClient({ scopes: authScopes, projectId: options.project });
  const token = await client.getAccessToken();
  token !== null ? apiv2.setAccessToken(token) : false;
}

/**
 * Ensures that there is an authenticated user.
 * @param options CLI options.
 */
export async function requireAuth(options: any): Promise<void> {
  api.setScopes([scopes.CLOUD_PLATFORM, scopes.FIREBASE_PLATFORM]);
  options.authScopes = api.getScopes();

  const tokens = options.tokens as Tokens | undefined;
  const user = options.user as User | undefined;

  let tokenOpt = utils.getInheritedOption(options, "token");
  if (tokenOpt) {
    logger.debug("> authorizing via --token option");
    utils.logWarning(
      "Authenticating with `--token` is deprecated and will be removed in a future major version of `firebase-tools`. " +
        "Instead, use a service account key with `GOOGLE_APPLICATION_CREDENTIALS`: https://cloud.google.com/docs/authentication/getting-started"
    );
  } else if (process.env.FIREBASE_TOKEN) {
    logger.debug("> authorizing via FIREBASE_TOKEN environment variable");
    utils.logWarning(
      "Authenticating with `FIREBASE_TOKEN` is deprecated and will be removed in a future major version of `firebase-tools`. " +
        "Instead, use a service account key with `GOOGLE_APPLICATION_CREDENTIALS`: https://cloud.google.com/docs/authentication/getting-started"
    );
  } else if (user) {
    logger.debug(`> authorizing via signed-in user (${user.email})`);
  } else {
    try {
      return await autoAuth(options, options.authScopes);
    } catch (e: any) {
      throw new FirebaseError(
        `Failed to authenticate, have you run ${clc.bold("firebase login")}?`,
        { original: e }
      );
    }
  }

  tokenOpt = tokenOpt || process.env.FIREBASE_TOKEN;

  if (tokenOpt) {
    setRefreshToken(tokenOpt);
    return;
  }

  if (!user || !tokens) {
    throw new FirebaseError(AUTH_ERROR_MESSAGE);
  }

  setActiveAccount(options, { user, tokens });
}
