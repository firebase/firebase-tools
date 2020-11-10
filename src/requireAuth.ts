import { GoogleAuth, GoogleAuthOptions } from "google-auth-library";
import * as clc from "cli-color";

import * as api from "./api";
import * as apiv2 from "./apiv2";
import { configstore } from "./configstore";
import { FirebaseError } from "./error";
import * as logger from "./logger";
import * as utils from "./utils";
import * as scopes from "./scopes";

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
  api.setAccessToken(token);
  token !== null ? apiv2.setAccessToken(token) : false;
}

/**
 * Ensures that there is an authenticated user.
 * @param options CLI options.
 */
export async function requireAuth(options: any): Promise<void> {
  api.setScopes([scopes.CLOUD_PLATFORM, scopes.FIREBASE_PLATFORM]);
  options.authScopes = api.getScopes();

  const tokens = configstore.get("tokens");
  const user = configstore.get("user");

  let tokenOpt = utils.getInheritedOption(options, "token");
  if (tokenOpt) {
    logger.debug("> authorizing via --token option");
  } else if (process.env.FIREBASE_TOKEN) {
    logger.debug("> authorizing via FIREBASE_TOKEN environment variable");
  } else if (user) {
    logger.debug("> authorizing via signed-in user");
  } else {
    try {
      return await autoAuth(options, options.authScopes);
    } catch (e) {
      throw new FirebaseError(
        `Failed to authenticate, have you run ${clc.bold("firebase login")}?`,
        { original: e }
      );
    }
  }

  tokenOpt = tokenOpt || process.env.FIREBASE_TOKEN;

  if (tokenOpt) {
    api.setRefreshToken(tokenOpt);
    apiv2.setRefreshToken(tokenOpt);
    return;
  }

  if (!user || !tokens) {
    throw new FirebaseError(AUTH_ERROR_MESSAGE);
  }

  options.user = user;
  options.tokens = tokens;
  api.setRefreshToken(tokens.refresh_token);
  apiv2.setRefreshToken(tokens.refresh_token);
}
