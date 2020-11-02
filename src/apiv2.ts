import fetch, { Response, RequestInit } from "node-fetch";

import { FirebaseError } from "./error";
import * as logger from "./logger";
import * as responseToError from "./responseToError";
import * as scopes from "./scopes";

const CLI_VERSION = require("../package.json").version;

const VALID_METHODS = new Set(["GET", "PUT", "POST", "DELETE", "PATCH"]);

type FirebaseRequestOptions = {
  method?: string;
  baseURL: string;
  path: string;
  headers?: { [key: string]: string };
  json?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  responseType?: "json";
  searchParams?: { [key: string]: string | number };
};

interface FirebaseRequestHandlingOptions {
  auth?: boolean;
  log?: {
    searchParams?: boolean;
    body?: boolean;
    resBody?: boolean;
  };
  resolveOnHTTPError?: boolean;
}

interface FirebaseResponse<T> {
  status: number;
  response: Response;
  body: T;
}

let accessToken = "";
let refreshToken = "";
let commandScopes: string[] = [];

async function internalRequest<T>(
  options: FirebaseRequestOptions,
  handlingOptions: FirebaseRequestHandlingOptions
): Promise<FirebaseResponse<T>> {
  if (!options.path.startsWith("/")) {
    options.path = "/" + options.path;
  }
  if (options.baseURL.endsWith("/")) {
    options.baseURL.substring(0, options.baseURL.length - 1);
  }

  let fetchURL = `${options.baseURL}${options.path}`;
  if (options.searchParams) {
    const sp = new URLSearchParams();
    for (const key of Object.keys(options.searchParams)) {
      const value = options.searchParams[key];
      if (value) {
        sp.append(key, `${value}`);
      }
    }
    fetchURL += "?" + sp.toString();
  }

  const fetchOptions: RequestInit = {
    headers: options.headers,
    method: options.method,
  };

  if (options.json) {
    fetchOptions.body = JSON.stringify(options.json);
  }

  logRequest(options, handlingOptions);

  let res: Response;
  try {
    res = await fetch(fetchURL, fetchOptions);
  } catch (err) {
    throw new FirebaseError(`Failed to make request to ${fetchURL}`, { original: err });
  }

  let body: T;
  if (options.responseType === "json") {
    body = await res.json();
  } else {
    body = (await res.text()) as any;
  }

  logResponse(res, body, handlingOptions);

  if (res.status >= 400) {
    throw responseToError({ statusCode: res.status }, body);
  }

  return {
    status: res.status,
    response: res,
    body,
  };
}

function logRequest(
  fetchOptions: FirebaseRequestOptions,
  handlingOptions: FirebaseRequestHandlingOptions
): void {
  let searchParamLog = "";
  if (fetchOptions.searchParams) {
    if (handlingOptions.log?.searchParams) {
      searchParamLog = JSON.stringify(fetchOptions.searchParams);
    } else {
      searchParamLog = "[SEARCH PARAMS OMITTED]";
    }
  }
  logger.debug(
    "[apiv2] HTTP REQUEST:",
    fetchOptions.method,
    `${fetchOptions.baseURL}${fetchOptions.path}`,
    searchParamLog
  );
  if (fetchOptions.json) {
    if (handlingOptions.log?.body) {
      logger.debug("[apiv2] HTTP REQUEST BODY:", JSON.stringify(fetchOptions.json));
    } else {
      logger.debug("[apiv2] HTTP REQUEST BODY OMITTED");
    }
  }
}

function logResponse<T>(
  res: Response,
  body: T,
  handlingOptions: FirebaseRequestHandlingOptions
): void {
  logger.debug("[apiv2] HTTP RESPONSE", res.status, res.headers);

  if (handlingOptions.log?.resBody) {
    logger.debug("[apiv2] HTTP RESPONSE BODY", body);
  }
}

/**
 * Sets the refresh token.
 * @param token refresh token.
 */
export function setRefreshToken(token = ""): void {
  refreshToken = token;
}

/**
 * Sets the access token.
 * @param token access token.
 */
export function setAccessToken(token = ""): void {
  accessToken = token;
}

/**
 * Returns the required scopes for a token.
 * @return required scopes.
 */
export function getScopes(): string[] {
  return commandScopes;
}

const REQUIRED_SCOPES = new Set<string>([
  scopes.EMAIL,
  scopes.OPENID,
  scopes.CLOUD_PROJECTS_READONLY,
  scopes.FIREBASE_PLATFORM,
]);

/**
 * Sets the required scopes for a token.
 * @param s required scopes.
 */
export function setScopes(s: string[] = []): void {
  const scopes = new Set(s);
  for (const scope of REQUIRED_SCOPES) {
    scopes.add(scope);
  }
  commandScopes = [...scopes.values()];
  logger.debug("> command requires scopes:", JSON.stringify(commandScopes));
}

async function getAccessToken(): Promise<string> {
  // Runtime fetch of Auth singleton to prevent circular module dependencies
  if (accessToken) {
    return accessToken;
  }
  const data = await require("./auth").getAccessToken(refreshToken, commandScopes);
  return data.access_token;
}

async function addRequestHeaders(
  reqOptions: FirebaseRequestOptions
): Promise<FirebaseRequestOptions> {
  if (!reqOptions.headers) {
    reqOptions.headers = {};
  }
  reqOptions.headers["Connection"] = "keep-alive";
  reqOptions.headers["User-Agent"] = `FirebaseCLI/${CLI_VERSION}`;
  reqOptions.headers["X-Client-Version"] = `FirebaseCLI/${CLI_VERSION}`;

  if (reqOptions.responseType === "json") {
    reqOptions.headers["Content-Type"] = "application/json";
  }

  const token = await getAccessToken();
  reqOptions.headers["Authorization"] = `Bearer ${token}`;

  return reqOptions;
}

/**
 * Makes a request as specified by the options.
 * By default, this will:
 *   - use content-type: application/json
 *   - assume the HTTP GET method
 *
 * @example
 * const res = apiv2.request<ResourceType>({
 *   method: "POST",
 *   baseURL: "https://example.com",
 *   path: "/some/resource",
 *   searchParams: { updateMask: "key" },
 *   json: { name: "resource-name", key: "updated-value" }
 * });
 * // typeof res.body === ResourceType
 *
 * @param reqOptions request options.
 * @param handlingOptions specific handling options about the request (logging,
 *   auth, etc).
 */
export async function request<T>(
  reqOptions: FirebaseRequestOptions,
  handlingOptions?: FirebaseRequestHandlingOptions
): Promise<FirebaseResponse<T>> {
  if (!handlingOptions) {
    handlingOptions = { auth: true };
  } else {
    // If `auth` is undefined (not falsey), default it to true.
    if (handlingOptions.auth === undefined) {
      handlingOptions.auth = true;
    }
  }

  if (!reqOptions.method || !VALID_METHODS.has(reqOptions.method)) {
    reqOptions.method = "GET";
  }

  if (!reqOptions.baseURL) {
    throw new FirebaseError("Cannot make request without a baseURL", { exit: 2 });
  }

  if (!reqOptions.path) {
    throw new FirebaseError("Will not make a request to an undefined path.", { exit: 2 });
  }

  // All requests default to JSON content types.
  if (!reqOptions.responseType) {
    reqOptions.responseType = "json";
  }

  if (handlingOptions.auth) {
    reqOptions = await addRequestHeaders(reqOptions);
  }
  return internalRequest<T>(reqOptions, handlingOptions);
}
