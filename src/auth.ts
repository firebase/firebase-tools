import * as clc from "colorette";
import * as FormData from "form-data";
import * as http from "http";
import * as jwt from "jsonwebtoken";
import * as opn from "open";
import * as portfinder from "portfinder";
import * as url from "url";

import * as apiv2 from "./apiv2";
import { configstore } from "./configstore";
import { FirebaseError, getErrMsg } from "./error";
import * as utils from "./utils";
import { logger } from "./logger";
import { promptOnce } from "./prompt";
import * as scopes from "./scopes";
import { clearCredentials } from "./defaultCredentials";
import { v4 as uuidv4 } from "uuid";
import { randomBytes, createHash } from "crypto";
import { trackGA4 } from "./track";
import {
  authOrigin,
  authProxyOrigin,
  clientId,
  clientSecret,
  githubClientId,
  githubClientSecret,
  githubOrigin,
  googleOrigin,
} from "./api";
import {
  Account,
  AuthError,
  User,
  Tokens,
  TokensWithExpiration,
  TokensWithTTL,
  GitHubAuthResponse,
  UserCredentials,
} from "./types/auth";
import { readTemplate } from "./templates";
import { refreshAuth } from "./requireAuth";

portfinder.setBasePort(9005);

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
    `Account ${account} not found, run "firebase login:list" to see existing accounts or "firebase login:add" to add a new one`,
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
    addAdditionalAccount(newAccount);
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
  const message =
    "Authentication Error: Your credentials are no longer valid. Please run " +
    clc.bold("firebase login --reauth") +
    "\n\n" +
    "For CI servers and headless environments, generate a new token with " +
    clc.bold("firebase login:ci");
  logger.error(message);
  return new FirebaseError(message, { exit: 1 });
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
    authOrigin() +
    "/o/oauth2/auth?" +
    queryParamString({
      client_id: clientId(),
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
  verifier?: string,
) {
  const params: Record<string, string> = {
    code: code,
    client_id: clientId(),
    client_secret: clientSecret(),
    redirect_uri: callbackUrl,
    grant_type: "authorization_code",
  };

  if (verifier) {
    params["code_verifier"] = verifier;
  }

  let res: apiv2.ClientResponse<TokensWithTTL>;
  try {
    const client = new apiv2.Client({ urlPrefix: authOrigin(), auth: false });
    const form = new FormData();
    for (const [k, v] of Object.entries(params)) {
      form.append(k, v);
    }
    res = await client.request<any, TokensWithTTL>({
      method: "POST",
      path: "/o/oauth2/token",
      body: form,
      headers: form.getHeaders(),
      skipLog: { body: true, queryParams: true, resBody: true },
    });
  } catch (err: unknown) {
    if (err instanceof Error) {
      logger.debug("Token Fetch Error:", err.stack || "");
    } else {
      logger.debug("Token Fetch Error");
    }
    throw invalidCredentialError();
  }
  if (!res.body.access_token && !res.body.refresh_token) {
    logger.debug("Token Fetch Error:", res.status, res.body);
    throw invalidCredentialError();
  }
  lastAccessToken = Object.assign(
    {
      expires_at: Date.now() + res.body.expires_in! * 1000,
    },
    res.body,
  );
  return lastAccessToken;
}

const GITHUB_SCOPES = ["read:user", "repo", "public_repo"];

function getGithubLoginUrl(callbackUrl: string) {
  return (
    githubOrigin() +
    "/login/oauth/authorize?" +
    queryParamString({
      client_id: githubClientId(),
      state: _nonce,
      redirect_uri: callbackUrl,
      scope: GITHUB_SCOPES.join(" "),
    })
  );
}

async function getGithubTokensFromAuthorizationCode(code: string, callbackUrl: string) {
  const client = new apiv2.Client({ urlPrefix: githubOrigin(), auth: false });
  const data = {
    client_id: githubClientId(),
    client_secret: githubClientSecret(),
    code,
    redirect_uri: callbackUrl,
    state: _nonce,
  };
  const form = new FormData();
  for (const [k, v] of Object.entries(data)) {
    form.append(k, v);
  }
  const headers = form.getHeaders();
  headers.accept = "application/json";
  const res = await client.request<any, GitHubAuthResponse>({
    method: "POST",
    path: "/login/oauth/access_token",
    body: form,
    headers,
  });
  return res.body.access_token;
}

function respondHtml(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  statusCode: number,
  html: string,
): void {
  res.writeHead(statusCode, {
    "Content-Length": html.length,
    "Content-Type": "text/html",
  });
  res.end(html);
  req.socket.destroy();
}

function urlsafeBase64(base64string: string) {
  return base64string.replace(/\+/g, "-").replace(/=+$/, "").replace(/\//g, "_");
}

async function loginRemotely(): Promise<UserCredentials> {
  const authProxyClient = new apiv2.Client({
    urlPrefix: authProxyOrigin(),
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

  const loginUrl = `${authProxyOrigin()}/login?code_challenge=${codeChallenge}&session=${sessionId}&attest=${attestToken}`;

  logger.info();
  logger.info("To sign in to the Firebase CLI:");
  logger.info();
  logger.info("1. Take note of your session ID:");
  logger.info();
  logger.info(`   ${clc.bold(sessionId.substring(0, 5).toUpperCase())}`);
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
      `${authProxyOrigin()}/complete`,
      codeVerifier,
    );

    void trackGA4("login", { method: "google_remote" });

    return {
      user: jwt.decode(tokens.id_token!, { json: true }) as any as User,
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
  const successHtml = await readTemplate("loginSuccess.html");
  const tokens = await loginWithLocalhost(
    port,
    callbackUrl,
    authUrl,
    successHtml,
    getTokensFromAuthorizationCode,
  );

  void trackGA4("login", { method: "google_localhost" });
  // getTokensFromAuthoirzationCode doesn't handle the --token case, so we know we'll
  // always have an id_token.
  return {
    user: jwt.decode(tokens.id_token!, { json: true }) as any as User,
    tokens: tokens,
    scopes: tokens.scopes!,
  };
}

async function loginWithLocalhostGitHub(port: number): Promise<string> {
  const callbackUrl = getCallbackUrl(port);
  const authUrl = getGithubLoginUrl(callbackUrl);
  const successHtml = await readTemplate("loginSuccessGithub.html");
  const tokens = await loginWithLocalhost(
    port,
    callbackUrl,
    authUrl,
    successHtml,
    getGithubTokensFromAuthorizationCode,
  );
  void trackGA4("login", { method: "github_localhost" });
  return tokens;
}

async function loginWithLocalhost<ResultType>(
  port: number,
  callbackUrl: string,
  authUrl: string,
  successHtml: string,
  getTokens: (queryCode: string, callbackUrl: string) => Promise<ResultType>,
): Promise<ResultType> {
  return new Promise<ResultType>((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const query = url.parse(`${req.url}`, true).query || {};
      const queryState = query.state;
      const queryCode = query.code;

      if (queryState !== _nonce || typeof queryCode !== "string") {
        const html = await readTemplate("loginFailure.html");
        respondHtml(req, res, 400, html);
        reject(new FirebaseError("Unexpected error while logging in"));
        server.close();
        return;
      }

      try {
        const tokens = await getTokens(queryCode, callbackUrl);
        respondHtml(req, res, 200, successHtml);
        resolve(tokens);
      } catch (err: unknown) {
        const html = await readTemplate("loginFailure.html");
        respondHtml(req, res, 400, html);
        reject(err);
      }
      server.close();
      return;
    });

    server.listen(port, () => {
      logger.info();
      logger.info("Visit this URL on this device to log in:");
      logger.info(clc.bold(clc.underline(authUrl)));
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
    try {
      const port = await getPort();
      return await loginWithLocalhostGoogle(port, userHint);
    } catch {
      return await loginRemotely();
    }
  }
  return await loginRemotely();
}

export async function loginGithub(): Promise<string> {
  const port = await getPort();
  return loginWithLocalhostGitHub(port);
}

export function findAccountByEmail(email: string): Account | undefined {
  return getAllAccounts().find((a) => a.user.email === email);
}

export function loggedIn() {
  return !!lastAccessToken;
}

export function isExpired(tokens: Tokens | undefined): boolean {
  const hasExpiration = (p: any): p is TokensWithExpiration => !!p.expires_at;
  if (hasExpiration(tokens)) {
    return !(tokens && tokens.expires_at && tokens.expires_at > Date.now());
  } else {
    return !tokens;
  }
}

export function haveValidTokens(refreshToken: string, authScopes: string[]) {
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
  const expired = (lastAccessToken?.expires_at || 0) < Date.now() + FIFTEEN_MINUTES_IN_MS;
  const valid = hasTokens && hasSameScopes && !expired;
  if (hasTokens) {
    logger.debug(
      `Checked if tokens are valid: ${valid}, expires at: ${lastAccessToken?.expires_at}`,
    );
  } else {
    logger.debug("No OAuth tokens found");
  }
  return valid;
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
  authScopes: string[],
): Promise<TokensWithExpiration> {
  logger.debug("> refreshing access token with scopes:", JSON.stringify(authScopes));
  try {
    const client = new apiv2.Client({ urlPrefix: googleOrigin(), auth: false });
    const data = {
      refresh_token: refreshToken,
      client_id: clientId(),
      client_secret: clientSecret(),
      grant_type: "refresh_token",
      scope: (authScopes || []).join(" "),
    };
    const form = new FormData();
    for (const [k, v] of Object.entries(data)) {
      form.append(k, v);
    }
    const res = await client.request<FormData, TokensWithTTL & AuthError>({
      method: "POST",
      path: "/oauth2/v3/token",
      body: form,
      headers: form.getHeaders(),
      skipLog: { body: true, queryParams: true, resBody: true },
      resolveOnHTTPError: true,
    });
    const forceReauthErrs: AuthError[] = [
      { error: "invalid_grant", error_subtype: "invalid_rapt" }, // Cloud Session Control expiry
    ];
    const matches = (a: AuthError, b: AuthError) => {
      return a.error === b.error && a.error_subtype === b.error_subtype;
    };
    if (forceReauthErrs.some((a) => matches(a, res.body))) {
      throw invalidCredentialError();
    }
    if (res.status === 401 || res.status === 400) {
      // Support --token <token> commands. In this case we won't have an expiration
      // time, scopes, etc.
      return { access_token: refreshToken };
    }

    if (typeof res.body.access_token !== "string") {
      throw invalidCredentialError();
    }
    lastAccessToken = Object.assign(
      {
        expires_at: Date.now() + res.body.expires_in! * 1000,
        refresh_token: refreshToken,
        scopes: authScopes,
      },
      res.body,
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
        { exit: 1 },
      );
    }

    throw invalidCredentialError();
  }
}

export async function getAccessToken(refreshToken: string, authScopes: string[]): Promise<Tokens> {
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

export async function logout(refreshToken: string) {
  if (lastAccessToken?.refresh_token === refreshToken) {
    lastAccessToken = undefined;
  }
  logoutCurrentSession(refreshToken);
  try {
    const client = new apiv2.Client({ urlPrefix: authOrigin(), auth: false });
    await client.get("/o/oauth2/revoke", { queryParams: { token: refreshToken } });
  } catch (thrown: any) {
    const err: Error = thrown instanceof Error ? thrown : new Error(thrown);
    throw new FirebaseError("Authentication Error.", {
      exit: 1,
      original: err,
    });
  }
}

/**
 * adds an account to the list of additional accounts.
 * @param account the account to add.
 */
export function addAdditionalAccount(account: Account): void {
  const additionalAccounts = getAdditionalAccounts();
  additionalAccounts.push(account);
  configstore.set("additionalAccounts", additionalAccounts);
}
