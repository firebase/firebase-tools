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
import * as apiv2 from "./apiv2";
import { configstore } from "./configstore";
import { FirebaseError } from "./error";
import * as utils from "./utils";
import { logger } from "./logger";
import { promptOnce } from "./prompt";
import * as scopes from "./scopes";
import { clearCredentials } from "./defaultCredentials";
import { v4 as uuidv4 } from "uuid";
import { randomBytes, createHash } from "crypto";
import { bold } from "cli-color";
import { track } from "./track";

/* eslint-disable camelcase */
// The wire protocol for an access token returned by Google.
// When we actually refresh from the server we should always have
// these optional fields, but when a user passes --token we may
// only have access_token.
export interface Tokens {
  id_token?: string;
  access_token: string;
  refresh_token?: string;
  scopes?: string[];
}

export interface User {
  email: string;

  iss?: string;
  azp?: string;
  aud?: string;
  sub?: number;
  hd?: string;
  email_verified?: boolean;
  at_hash?: string;
  iat?: number;
  exp?: number;
}

export interface Account {
  user: User;
  tokens: Tokens;
}

interface TokensWithExpiration extends Tokens {
  expires_at?: number;
}

interface TokensWithTTL extends Tokens {
  expires_in?: number;
}

interface UserCredentials {
  user: string | User;
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
(portfinder as unknown as { basePort: number }).basePort = 9005;

/**
 * Get the global default account. Before multi-auth was implemented
 * this was the only account.
 */
export function getGlobalDefaultAccount(): Account | undefined {
  const user = configstore.get("user") as User | undefined;
  const tokens = configstore.get("tokens") as Tokens | undefined;

  // TODO: Is there ever a case where only User or Tokens is defined
  //       and we want to accept that?
  if (!user || !tokens) {
    return undefined;
  }

  return {
    user,
    tokens,
  };
}

/**
 * Get the default account associated with a project directory, or the global default.
 * @param projectDir the Firebase project directory.
 */
export function getProjectDefaultAccount(projectDir?: string | null): Account | undefined {
  if (!projectDir) {
    return getGlobalDefaultAccount();
  }

  const activeAccounts = configstore.get("activeAccounts") || {};
  const email: string | undefined = activeAccounts[projectDir];

  if (!email) {
    return getGlobalDefaultAccount();
  }

  const allAccounts = getAllAccounts();
  return allAccounts.find((a) => a.user.email === email);
}

/**
 * Get all authenticated accounts _besides_ the default account.
 */
export function getAdditionalAccounts(): Account[] {
  return configstore.get("additionalAccounts") || [];
}

/**
 * Get all authenticated accounts.
 */
export function getAllAccounts(): Account[] {
  const res: Account[] = [];

  const defaultUser = getGlobalDefaultAccount();
  if (defaultUser) {
    res.push(defaultUser);
  }

  res.push(...getAdditionalAccounts());

  return res;
}

/**
 * Set the globally active account. Modifies the options object
 * and sets global refresh token state.
 * @param options options object.
 * @param account account to make active.
 */
export function setActiveAccount(options: any, account: Account) {
  if (account.tokens.refresh_token) {
    setRefreshToken(account.tokens.refresh_token);
  }

  options.user = account.user;
  options.tokens = account.tokens;
}

/**
 * Set the global refresh token in both api and apiv2.
 * @param token refresh token string
 */
export function setRefreshToken(token: string) {
  api.setRefreshToken(token);
  apiv2.setRefreshToken(token);
}

/**
 * Select the right account to use based on the --account flag and the
 * project defaults.
 * @param account the --account flag, if passed.
 * @param projectRoot the Firebase project root directory, if known.
 */
export function selectAccount(account?: string, projectRoot?: string): Account | undefined {
  const defaultUser = getProjectDefaultAccount(projectRoot);

  // Default to single-account behavior
  if (!account) {
    return defaultUser;
  }

  // Ensure that the user exists if specified
  if (!defaultUser) {
    throw new FirebaseError(`Account ${account} not found, have you run "firebase login"?`);
  }

  const matchingAccount = getAllAccounts().find((a) => a.user.email === account);
  if (matchingAccount) {
    return matchingAccount;
  }

  throw new FirebaseError(
    `Account ${account} not found, run "firebase login:list" to see existing accounts or "firebase login:add" to add a new one`
  );
}

/**
 * Add an additional account to the login list.
 * @param useLocalhost should the flow be interactive or code-based?
 * @param email an optional hint to use for the google account picker
 */
export async function loginAdditionalAccount(useLocalhost: boolean, email?: string) {
  // Log the user in using the passed email as a hint
  const result = await loginGoogle(useLocalhost, email);

  // The JWT library can technically return a string, even though it never should.
  if (typeof result.user === "string") {
    throw new FirebaseError("Failed to parse auth response, see debug log.");
  }

  const resultEmail = result.user.email;
  if (email && resultEmail !== email) {
    utils.logWarning(`Chosen account ${resultEmail} does not match account hint ${email}`);
  }

  const allAccounts = getAllAccounts();

  const newAccount = {
    user: result.user,
    tokens: result.tokens,
  };

  const existingAccount = allAccounts.find((a) => a.user.email === resultEmail);
  if (existingAccount) {
    utils.logWarning(`Already logged in as ${resultEmail}.`);
    updateAccount(newAccount);
  } else {
    const additionalAccounts = getAdditionalAccounts();
    additionalAccounts.push(newAccount);
    configstore.set("additionalAccounts", additionalAccounts);
  }

  return newAccount;
}

/**
 * Set the default account to use with a Firebase project directory. Writes
 * the setting to disk.
 * @param projectDir the Firebase project directory.
 * @param email email of the account.
 */
export function setProjectAccount(projectDir: string, email: string) {
  logger.debug(`setProjectAccount(${projectDir}, ${email})`);
  const activeAccounts: Record<string, string> = configstore.get("activeAccounts") || {};
  activeAccounts[projectDir] = email;
  configstore.set("activeAccounts", activeAccounts);
}

/**
 * Set the global default account.
 */
export function setGlobalDefaultAccount(account: Account) {
  configstore.set("user", account.user);
  configstore.set("tokens", account.tokens);

  const additionalAccounts = getAdditionalAccounts();
  const index = additionalAccounts.findIndex((a) => a.user.email === account.user.email);
  if (index >= 0) {
    additionalAccounts.splice(index, 1);
    configstore.set("additionalAccounts", additionalAccounts);
  }
}

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

async function getTokensFromAuthorizationCode(
  code: string,
  callbackUrl: string,
  verifier?: string
) {
  let res: {
    body?: TokensWithTTL;
    statusCode: number;
  };

  const params: Record<string, string> = {
    code: code,
    client_id: api.clientId,
    client_secret: api.clientSecret,
    redirect_uri: callbackUrl,
    grant_type: "authorization_code",
  };

  if (verifier) {
    params["code_verifier"] = verifier;
  }

  try {
    res = await api.request("POST", "/o/oauth2/token", {
      origin: api.authOrigin,
      form: params,
    });
  } catch (err: any) {
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

function urlsafeBase64(base64string: string) {
  return base64string.replace(/\+/g, "-").replace(/=+$/, "").replace(/\//g, "_");
}

async function loginRemotely(userHint?: string): Promise<UserCredentials> {
  const authProxyClient = new apiv2.Client({
    urlPrefix: api.authProxyOrigin,
    auth: false,
  });

  const sessionId = uuidv4();
  const codeVerifier = randomBytes(32).toString("hex");
  // urlsafe base64 is required for code_challenge in OAuth PKCE
  const codeChallenge = urlsafeBase64(createHash("sha256").update(codeVerifier).digest("base64"));

  const attestToken = (
    await authProxyClient.post<{ session_id: string }, { token: string }>("/attest", {
      session_id: sessionId,
    })
  ).body?.token;

  const loginUrl = `${api.authProxyOrigin}/login?code_challenge=${codeChallenge}&session=${sessionId}&attest=${attestToken}`;

  logger.info();
  logger.info("To sign in to the Firebase CLI:");
  logger.info();
  logger.info("1. Take note of your session ID:");
  logger.info();
  logger.info(`   ${bold(sessionId.substring(0, 5).toUpperCase())}`);
  logger.info();
  logger.info("2. Visit the URL below on any device and follow the instructions to get your code:");
  logger.info();
  logger.info(`   ${loginUrl}`);
  logger.info();
  logger.info("3. Paste or enter the authorization code below once you have it:");
  logger.info();

  const code = await promptOnce({
    type: "input",
    message: "Enter authorization code:",
  });

  try {
    const tokens = await getTokensFromAuthorizationCode(
      code,
      `${api.authProxyOrigin}/complete`,
      codeVerifier
    );

    void track("login", "google_remote");

    return {
      user: jwt.decode(tokens.id_token!) as User,
      tokens: tokens,
      scopes: SCOPES,
    };
  } catch (e) {
    throw new FirebaseError("Unable to authenticate using the provided code. Please try again.");
  }
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

  void track("login", "google_localhost");
  // getTokensFromAuthoirzationCode doesn't handle the --token case, so we know we'll
  // always have an id_token.
  return {
    user: jwt.decode(tokens.id_token!) as User,
    tokens: tokens,
    scopes: tokens.scopes!,
  };
}

async function loginWithLocalhostGitHub(port: number): Promise<string> {
  const callbackUrl = getCallbackUrl(port);
  const authUrl = getGithubLoginUrl(callbackUrl);
  const successTemplate = "../templates/loginSuccessGithub.html";
  const tokens = await loginWithLocalhost(
    port,
    callbackUrl,
    authUrl,
    successTemplate,
    getGithubTokensFromAuthorizationCode
  );
  void track("login", "google_localhost");
  return tokens;
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
      } catch (err: any) {
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
      return await loginRemotely(userHint);
    }
  }
  return await loginRemotely(userHint);
}

export async function loginGithub(): Promise<string> {
  const port = await getPort();
  return loginWithLocalhostGitHub(port);
}

export function findAccountByEmail(email: string): Account | undefined {
  return getAllAccounts().find((a) => a.user.email === email);
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

function deleteAccount(account: Account) {
  // Check the global default user
  const defaultAccount = getGlobalDefaultAccount();
  if (account.user.email === defaultAccount?.user.email) {
    configstore.delete("user");
    configstore.delete("tokens");
    configstore.delete("usage");
    configstore.delete("analytics-uuid");
  }

  // Check all additional users
  const additionalAccounts = getAdditionalAccounts();
  const remainingAccounts = additionalAccounts.filter((a) => a.user.email !== account.user.email);
  configstore.set("additionalAccounts", remainingAccounts);

  // Clear any matching project defaults
  const activeAccounts: Record<string, string> = configstore.get("activeAccounts") || {};
  for (const [projectDir, projectAccount] of Object.entries(activeAccounts)) {
    if (projectAccount === account.user.email) {
      delete activeAccounts[projectDir];
    }
  }
  configstore.set("activeAccounts", activeAccounts);
}

function updateAccount(account: Account) {
  const defaultAccount = getGlobalDefaultAccount();
  if (account.user.email === defaultAccount?.user.email) {
    configstore.set("user", account.user);
    configstore.set("tokens", account.tokens);
  }

  const additionalAccounts = getAdditionalAccounts();
  const accountIndex = additionalAccounts.findIndex((a) => a.user.email === account.user.email);
  if (accountIndex >= 0) {
    additionalAccounts.splice(accountIndex, 1, account);
    configstore.set("additionalAccounts", additionalAccounts);
  }
}

function findAccountByRefreshToken(refreshToken: string): Account | undefined {
  return getAllAccounts().find((a) => a.tokens.refresh_token === refreshToken);
}

function logoutCurrentSession(refreshToken: string) {
  const account = findAccountByRefreshToken(refreshToken);
  if (!account) {
    return;
  }

  clearCredentials(account);
  deleteAccount(account);
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

    const account = findAccountByRefreshToken(refreshToken);
    if (account && lastAccessToken) {
      account.tokens = lastAccessToken;
      updateAccount(account);
    }

    return lastAccessToken!;
  } catch (err: any) {
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
  } catch (thrown: any) {
    const err: Error = thrown instanceof Error ? thrown : new Error(thrown);
    throw new FirebaseError("Authentication Error.", {
      exit: 1,
      original: err,
    });
  }
}
