import * as _ from "lodash";
import * as https from "https";
import * as requestModule from "request";

import { FirebaseError } from "./error";
import * as logger from "./logger";
import * as responseToError from "./responseToError";
import * as scopes from "./scopes";

const CLI_VERSION = require("../package.json").version;

const VALID_METHODS = new Set(["GET", "PUT", "POST", "DELETE", "PATCH"]);

type FirebaseRequestOptions = https.RequestOptions & {
  json?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  responseType?: "json";
  searchParams?: { [key: string]: string | number };
};

interface FirebaseRequestHandlingOptions {
  auth?: boolean;
  log?: {
    searchParams: boolean;
    body: boolean;
  };
  resolveOnHTTPError?: boolean;
}

interface FirebaseResponse<T> {
  status: number;
  response: requestModule.Response;
  body: T;
}

let accessToken = "";
let refreshToken = "";
let commandScopes: string[] = [];

function internalRequest<T>(
  options: FirebaseRequestOptions,
  handlingOptions: FirebaseRequestHandlingOptions
): Promise<FirebaseResponse<T>> {
  let searchParamsLog = "";
  let bodyLog = "<request body omitted>";

  if (options.searchParams && !handlingOptions.log?.searchParams) {
    searchParamsLog = JSON.stringify(options.searchParams);
  }

  if (!handlingOptions.log?.body) {
    bodyLog = options.json;
  }

  logger.debug(
    "[apiv2] HTTP REQUEST:",
    options.method,
    options.protocol,
    options.hostname,
    options.path,
    searchParamsLog
  );
  logger.debug("[apiv2] HTTP REQUEST BODY:", bodyLog);

  const requestModuleOptions: requestModule.OptionsWithUrl = {
    url: `${options.protocol}//${options.hostname}${options.path}`,
    headers: options.headers,
    method: options.method,
    qs: options.searchParams,
  };

  if (options.json) {
    requestModuleOptions.body = JSON.stringify(options.json);
  }

  return new Promise((resolve, reject) => {
    requestModule(requestModuleOptions, (err, response, body) => {
      if (err) {
        return reject(err);
      }

      if (response.statusCode >= 400) {
        return reject(responseToError(response, body));
      }

      if (options.responseType === "json") {
        body = JSON.parse(body);
      }

      return resolve({
        status: response.statusCode,
        response,
        body,
      });
    });
  });
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
): Promise<https.RequestOptions> {
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
 *   - assume https: protocol
 *   - assume the HTTP GET method
 *
 * @example
 * const res = apiv2.request<ResourceType>({
 *   method: "POST",
 *   hostname: "https://example.com",
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
  handlingOptions: FirebaseRequestHandlingOptions = { auth: true }
): Promise<FirebaseResponse<T>> {
  if (!reqOptions.method || !VALID_METHODS.has(reqOptions.method)) {
    reqOptions.method = "GET";
  }

  if (!reqOptions.hostname) {
    throw new FirebaseError("Cannot make request without a hostname", { exit: 2 });
  }
  // For backwards-compatibility with api.js origins, remove and set `protocol`.
  if (reqOptions.hostname.startsWith("https://")) {
    reqOptions.hostname = reqOptions.hostname.replace("https://", "");
    reqOptions.protocol = "https:";
  }

  if (!reqOptions.protocol) {
    reqOptions.protocol = "https:";
  }

  if (!reqOptions.path) {
    throw new FirebaseError("Will not make a request to an undefined path.", { exit: 2 });
  }

  // All requests default to JSON content types.
  if (!reqOptions.responseType) {
    reqOptions.responseType = "json";
  }

  const requestFunction = async (): Promise<FirebaseResponse<T>> => {
    if (handlingOptions.auth) {
      reqOptions = await addRequestHeaders(reqOptions);
    }
    return internalRequest<T>(reqOptions, handlingOptions);
  };

  // TODO(bkendall): add retry handling.
  return await requestFunction();
}
