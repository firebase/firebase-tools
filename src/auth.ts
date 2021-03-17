import * as clc from "cli-color";
import * as fs from "fs";
import * as jwt from "jsonwebtoken";
import * as http from "http";
import * as opn from "open";
import * as path from "path";
import * as portfinder from "portfinder";
import * as url from "url";
import * as util from "util";

import * as api from "./api";
import { configstore } from "./configstore";
import { FirebaseError } from "./error";
import { logger } from "./logger";
import { prompt } from "./prompt";
import * as scopes from "./scopes";

/* eslint-disable camelcase */
// The wire protocol for an access token returned by Google.
// When we actually refresh from the server we should always have
// these optional fields, but when a user passes --token we may
// only have access_token.
interface Tokens {
  id_token?: string;
  access_token: string;
  refresh_token?: string;
  scopes?: string[];
}

interface TokensWithExpiration extends Tokens {
  expires_at?: number;
}

interface TokensWithTTL extends Tokens {
  expires_in?: number;
}

interface UserCredentials {
  user: string | { [key: string]: unknown };
  tokens: TokensWithExpiration;
  scopes: string[];
}

// https://docs.github.com/en/developers/apps/authorizing-oauth-apps
interface GitHubAuthResponse {
  access_token: string;
  scope: string;
  token_type: string;
}
/* eslint-enable camelcase */

// Typescript emulates modules, which have constant exports. We can
// overcome this by casting to any
// TODO fix after https://github.com/http-party/node-portfinder/pull/115
((portfinder as unknown) as { basePort: number }).basePort = 9005;

function open(url: string): void {
  opn(url).catch((err) => {
    logger.debug("Unable to open URL: " + err.stack);
  });
}

// Always create a new error so that the stack is useful
function invalidCredentialError(): FirebaseError {
  return new FirebaseError(
    "Authentication Error: Your credentials are no longer valid. Please run " +
      clc.bold("firebase login --reauth") +
      "\n\n" +
      "For CI servers and headless environments, generate a new token with " +
      clc.bold("firebase login:ci"),
    { exit: 1 }
  );
}

const FIFTEEN_MINUTES_IN_MS = 15 * 60 * 1000;
const SCOPES = [
  scopes.EMAIL,
  scopes.OPENID,
  scopes.CLOUD_PROJECTS_READONLY,
  scopes.FIREBASE_PLATFORM,
  scopes.CLOUD_PLATFORM,
];

const _nonce = Math.floor(Math.random() * (2 << 29) + 1).toString();
const getPort = portfinder.getPortPromise;

// in-memory cache, so we have it for successive calls
let lastAccessToken: TokensWithExpiration | undefined;

function getCallbackUrl(port?: number): string {
  if (typeof port === "undefined") {
    return "urn:ietf:wg:oauth:2.0:oob";
  }
  return `http://localhost:${port}`;
}

function queryParamString(args: { [key: string]: string | undefined }) {
  const tokens: string[] = [];
  for (const [key, value] of Object.entries(args)) {
    if (typeof value === "string") {
      tokens.push(key + "=" + encodeURIComponent(value));
    }
  }
  return tokens.join("&");
}

function getLoginUrl(callbackUrl: string, userHint?: string) {
  return (
    api.authOrigin +
    "/o/oauth2/auth?" +
    queryParamString({
      client_id: api.clientId,
      scope: SCOPES.join(" "),
      response_type: "code",
      state: _nonce,
      redirect_uri: callbackUrl,
      login_hint: userHint,
    })
  );
}

async function getTokensFromAuthorizationCode(code: string, callbackUrl: string) {
  let res: {
    body?: TokensWithTTL;
    statusCode: number;
  };

  try {
    res = await api.request("POST", "/o/oauth2/token", {
      origin: api.authOrigin,
      form: {
        code: code,
        client_id: api.clientId,
        client_secret: api.clientSecret,
        redirect_uri: callbackUrl,
        grant_type: "authorization_code",
      },
    });
  } catch (err) {
    if (err instanceof Error) {
      logger.debug("Token Fetch Error:", err.stack || "");
    } else {
      logger.debug("Token Fetch Error");
    }
    throw invalidCredentialError();
  }
  if (!res?.body?.access_token && !res?.body?.refresh_token) {
    logger.debug("Token Fetch Error:", res.statusCode, res.body);
    throw invalidCredentialError();
  }
  lastAccessToken = Object.assign(
    {
      expires_at: Date.now() + res!.body!.expires_in! * 1000,
    },
    res.body
  );
  return lastAccessToken;
}

const GITHUB_SCOPES = ["read:user", "repo", "public_repo"];

function getGithubLoginUrl(callbackUrl: string) {
  return (
    api.githubOrigin +
    "/login/oauth/authorize?" +
    queryParamString({
      client_id: api.githubClientId,
      state: _nonce,
      redirect_uri: callbackUrl,
      scope: GITHUB_SCOPES.join(" "),
    })
  );
}

async function getGithubTokensFromAuthorizationCode(code: string, callbackUrl: string) {
  const res: { body: GitHubAuthResponse } = await api.request("POST", "/login/oauth/access_token", {
    origin: api.githubOrigin,
    form: {
      client_id: api.githubClientId,
      client_secret: api.githubClientSecret,
      code,
      redirect_uri: callbackUrl,
      state: _nonce,
    },
  });
  return res.body.access_token as string;
}

async function respondWithFile(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  statusCode: number,
  filename: string
) {
  const response = await util.promisify(fs.readFile)(path.join(__dirname, filename));
  res.writeHead(statusCode, {
    "Content-Length": response.length,
    "Content-Type": "text/html",
  });
  res.end(response);
  req.socket.destroy();
}

async function loginWithoutLocalhost(userHint?: string): Promise<UserCredentials> {
  const callbackUrl = getCallbackUrl();
  const authUrl = getLoginUrl(callbackUrl, userHint);

  logger.info();
  logger.info("Visit this URL on any device to log in:");
  logger.info(clc.bold.underline(authUrl));
  logger.info();

  open(authUrl);

  const answers: { code: string } = await prompt({}, [
    {
      type: "input",
      name: "code",
      message: "Paste authorization code here:",
    },
  ]);
  const tokens = await getTokensFromAuthorizationCode(answers.code, callbackUrl);
  // getTokensFromAuthorizationCode doesn't handle the --token case, so we know
  // that we'll have a valid id_token.
  return {
    user: jwt.decode(tokens.id_token!)!,
    tokens: tokens,
    scopes: SCOPES,
  };
}

async function loginWithLocalhostGoogle(port: number, userHint?: string): Promise<UserCredentials> {
  const callbackUrl = getCallbackUrl(port);
  const authUrl = getLoginUrl(callbackUrl, userHint);
  const successTemplate = "../templates/loginSuccess.html";
  const tokens = await loginWithLocalhost(
    port,
    callbackUrl,
    authUrl,
    successTemplate,
    getTokensFromAuthorizationCode
  );
  // getTokensFromAuthoirzationCode doesn't handle the --token case, so we know we'll
  // always have an id_token.
  return {
    user: jwt.decode(tokens.id_token!)!,
    tokens: tokens,
    scopes: tokens.scopes!,
  };
}

async function loginWithLocalhostGitHub(port: number): Promise<string> {
  const callbackUrl = getCallbackUrl(port);
  const authUrl = getGithubLoginUrl(callbackUrl);
  const successTemplate = "../templates/loginSuccessGithub.html";
  return loginWithLocalhost(
    port,
    callbackUrl,
    authUrl,
    successTemplate,
    getGithubTokensFromAuthorizationCode
  );
}

async function loginWithLocalhost<ResultType>(
  port: number,
  callbackUrl: string,
  authUrl: string,
  successTemplate: string,
  getTokens: (queryCode: string, callbackUrl: string) => Promise<ResultType>
): Promise<ResultType> {
  return new Promise<ResultType>((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      let tokens: Tokens;
      const query = url.parse(`${req.url}`, true).query || {};
      const queryState = query.state;
      const queryCode = query.code;

      if (queryState !== _nonce || typeof queryCode !== "string") {
        await respondWithFile(req, res, 400, "../templates/loginFailure.html");
        reject(new FirebaseError("Unexpected error while logging in"));
        server.close();
        return;
      }

      try {
        const tokens = await getTokens(queryCode, callbackUrl);
        await respondWithFile(req, res, 200, successTemplate);
        resolve(tokens);
      } catch (err) {
        await respondWithFile(req, res, 400, "../templates/loginFailure.html");
        reject(err);
      }
      server.close();
      return;
    });

    server.listen(port, () => {
      logger.info();
      logger.info("Visit this URL on this device to log in:");
      logger.info(clc.bold.underline(authUrl));
      logger.info();
      logger.info("Waiting for authentication...");

      open(authUrl);
    });

    server.on("error", (err) => {
      reject(err);
    });
  });
}

export async function loginGoogle(localhost: boolean, userHint?: string): Promise<UserCredentials> {
  if (localhost) {
    const port = await getPort();
    try {
      const port = await getPort();
      return await loginWithLocalhostGoogle(port, userHint);
    } catch {
      return await loginWithoutLocalhost(userHint);
    }
  }
  return await loginWithoutLocalhost(userHint);
}

export async function loginGithub(): Promise<string> {
  const port = await getPort();
  return loginWithLocalhostGitHub(port);
}

function haveValidTokens(refreshToken: string, authScopes: string[]) {
  if (!lastAccessToken?.access_token) {
    const tokens = configstore.get("tokens");
    if (refreshToken === tokens?.refresh_token) {
      lastAccessToken = tokens;
    }
  }

  const hasTokens = !!lastAccessToken?.access_token;
  const oldScopesJSON = JSON.stringify(lastAccessToken?.scopes?.sort() || []);
  const newScopesJSON = JSON.stringify(authScopes.sort());
  const hasSameScopes = oldScopesJSON === newScopesJSON;
  // To avoid token expiration in the middle of a long process we only hand out
  // tokens if they have a _long_ time before the server rejects them.
  const isExpired = (lastAccessToken?.expires_at || 0) < Date.now() + FIFTEEN_MINUTES_IN_MS;

  return hasTokens && hasSameScopes && !isExpired;
}

function logoutCurrentSession(refreshToken: string) {
  const tokens = configstore.get("tokens");
  const currentToken = tokens?.refresh_token;
  if (refreshToken === currentToken) {
    configstore.delete("user");
    configstore.delete("tokens");
    configstore.delete("usage");
    configstore.delete("analytics-uuid");
  }
}

async function refreshTokens(
  refreshToken: string,
  authScopes: string[]
): Promise<TokensWithExpiration> {
  logger.debug("> refreshing access token with scopes:", JSON.stringify(authScopes));
  try {
    const res = await api.request("POST", "/oauth2/v3/token", {
      origin: api.googleOrigin,
      form: {
        refresh_token: refreshToken,
        client_id: api.clientId,
        client_secret: api.clientSecret,
        grant_type: "refresh_token",
        scope: (authScopes || []).join(" "),
      },
      logOptions: { skipRequestBody: true, skipQueryParams: true, skipResponseBody: true },
    });
    if (res.status === 401 || res.status === 400) {
      // Support --token <token> commands. In this case we won't have an expiration
      // time, scopes, etc.
      return { access_token: refreshToken };
    }

    if (typeof res.body?.access_token !== "string") {
      throw invalidCredentialError();
    }
    lastAccessToken = Object.assign(
      {
        expires_at: Date.now() + res.body.expires_in * 1000,
        refresh_token: refreshToken,
        scopes: authScopes,
      },
      res.body
    );

    const currentRefreshToken = configstore.get("tokens")?.refresh_token;
    if (refreshToken === currentRefreshToken) {
      configstore.set("tokens", lastAccessToken);
    }
    return lastAccessToken!;
  } catch (err) {
    if (err?.context?.body?.error === "invalid_scope") {
      throw new FirebaseError(
        "This command requires new authorization scopes not granted to your current session. Please run " +
          clc.bold("firebase login --reauth") +
          "\n\n" +
          "For CI servers and headless environments, generate a new token with " +
          clc.bold("firebase login:ci"),
        { exit: 1 }
      );
    }

    throw invalidCredentialError();
  }
}

export async function getAccessToken(refreshToken: string, authScopes: string[]) {
  if (haveValidTokens(refreshToken, authScopes)) {
    return lastAccessToken;
  }

  return refreshTokens(refreshToken, authScopes);
}

export async function logout(refreshToken: string) {
  if (lastAccessToken?.refresh_token === refreshToken) {
    lastAccessToken = undefined;
  }
  logoutCurrentSession(refreshToken);
  try {
    await api.request("GET", "/o/oauth2/revoke", {
      origin: api.authOrigin,
      data: {
        token: refreshToken,
      },
    });
  } catch (thrown) {
    const err: Error = thrown instanceof Error ? thrown : new Error(thrown);
    throw new FirebaseError("Authentication Error.", {
      exit: 1,
      original: err,
    });
  }
}
