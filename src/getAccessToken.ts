import { haveValidTokens, lastAccessToken, refreshTokens } from "./auth.js";
import { getErrMsg, FirebaseError } from "./error.js";
import { logger } from "./logger.js";
import { refreshAuth } from "./requireAuth.js";
import { Tokens } from "./types/auth/index.js";


export default async function getAccessToken(refreshToken: string, authScopes: string[]): Promise<Tokens> {
  if (haveValidTokens(refreshToken, authScopes) && lastAccessToken) {
    return lastAccessToken;
  }
  if (refreshToken) {
    return refreshTokens(refreshToken, authScopes);
  } else {
    try {
      return refreshAuth();
    } catch (err: unknown) {
      logger.debug(`Unable to refresh token: ${getErrMsg(err)}`);
    }
    throw new FirebaseError("Unable to getAccessToken");
  }
}
