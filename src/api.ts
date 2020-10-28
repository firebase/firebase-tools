import * as _ from "lodash";
import * as querystring from "querystring";
import * as requestModule from "request";
import * as url from "url";
import * as FormData from "form-data";

import { Constants } from "./emulator/constants";
import { FirebaseError } from "./error";
import * as logger from "./logger";
import * as responseToError from "./responseToError";
import * as scopes from "./scopes";
import * as utils from "./utils";

export enum HttpMethod {
  GET = "GET",
  PUT = "PUT",
  POST = "POST",
  DELETE = "DELETE",
  PATCH = "PATCH",
}

interface UploadFile extends FormData.AppendOptions {
  stream: unknown;
}

interface FirebaseRequestLogOptions {
  skipQueryParams?: boolean;
  skipRequestBody?: boolean;
  skipResponseBody?: boolean;
}

interface FirebaseRequestOptions {
  auth?: boolean;
  data?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  files?: { [k: string]: UploadFile };
  form?: { [k: string]: any }; // eslint-disable-line @typescript-eslint/no-explicit-any
  headers?: requestModule.Headers;
  json?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  logOptions?: FirebaseRequestLogOptions;
  origin: string;
  qs?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  query?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  resolveOnHTTPError?: boolean;
  retryCodes?: number[];
  timeout?: number;
}

interface FirebaseResponse {
  status: number;
  response: requestModule.Response;
  body: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

const CLI_VERSION = require("../package.json").version;
const VALID_METHODS = new Set(["GET", "PUT", "POST", "DELETE", "PATCH"]);

let accessToken = "";
let refreshToken = "";
let commandScopes: string[] = [];

function internalRequest(
  options: requestModule.OptionsWithUrl,
  logOptions: FirebaseRequestLogOptions = {}
): Promise<FirebaseResponse> {
  let qsLog = "";
  let bodyLog = "<request body omitted>";

  if (options.qs && !logOptions.skipQueryParams) {
    qsLog = JSON.stringify(options.qs);
  }

  if (!logOptions.skipRequestBody) {
    bodyLog = options.body || options.form || "";
  }

  logger.debug(">>> HTTP REQUEST", options.method, options.url, qsLog, "\n", bodyLog);

  options.headers = options.headers || {};
  options.headers["connection"] = "keep-alive";

  return new Promise((resolve, reject) => {
    requestModule(options, (err: Error, response: requestModule.Response, body: unknown) => {
      if (err) {
        return reject(
          new FirebaseError("Server Error. " + err.message, {
            original: err,
            exit: 2,
          })
        );
      }

      logger.debug("<<< HTTP RESPONSE", response.statusCode, response.headers);
      if (response.statusCode >= 400 && !logOptions.skipResponseBody) {
        logger.debug("<<< HTTP RESPONSE BODY", response.body);
      }

      return resolve({
        status: response.statusCode,
        response: response,
        body: body,
      });
    });
  });
}

function appendQueryData(path: string, data: { [k: string]: string }): string {
  if (data && _.size(data) > 0) {
    path += _.includes(path, "?") ? "&" : "?";
    path += querystring.stringify(data);
  }
  return path;
}

// "In this context, the client secret is obviously not treated as a secret"
// https://developers.google.com/identity/protocols/OAuth2InstalledApp
export const clientId = utils.envOverride(
  "FIREBASE_CLIENT_ID",
  "563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com"
);
export const clientSecret = utils.envOverride("FIREBASE_CLIENT_SECRET", "j9iVZfS8kkCEFUPaAeJV0sAi");
export const cloudbillingOrigin = utils.envOverride(
  "FIREBASE_CLOUDBILLING_URL",
  "https://cloudbilling.googleapis.com"
);
export const cloudloggingOrigin = utils.envOverride(
  "FIREBASE_CLOUDLOGGING_URL",
  "https://logging.googleapis.com"
);
export const appDistributionOrigin = utils.envOverride(
  "FIREBASE_APP_DISTRIBUTION_URL",
  "https://firebaseappdistribution.googleapis.com"
);
export const appDistributionUploadOrigin = utils.envOverride(
  "FIREBASE_APP_DISTRIBUTION_UPLOAD_URL",
  "https://appdistribution-uploads.crashlytics.com"
);
export const appengineOrigin = utils.envOverride(
  "FIREBASE_APPENGINE_URL",
  "https://appengine.googleapis.com"
);
export const authOrigin = utils.envOverride("FIREBASE_AUTH_URL", "https://accounts.google.com");
export const consoleOrigin = utils.envOverride(
  "FIREBASE_CONSOLE_URL",
  "https://console.firebase.google.com"
);
export const deployOrigin = utils.envOverride(
  "FIREBASE_DEPLOY_URL",
  utils.envOverride("FIREBASE_UPLOAD_URL", "https://deploy.firebase.com")
);
export const firebaseApiOrigin = utils.envOverride(
  "FIREBASE_API_URL",
  "https://firebase.googleapis.com"
);
export const firebaseExtensionsRegistryOrigin = utils.envOverride(
  "FIREBASE_EXT_REGISTRY_ORIGIN",
  "https://extensions-registry.firebaseapp.com"
);
export const firedataOrigin = utils.envOverride(
  "FIREBASE_FIREDATA_URL",
  "https://mobilesdk-pa.googleapis.com"
);
export const firestoreOriginOrEmulator = utils.envOverride(
  Constants.FIRESTORE_EMULATOR_HOST,
  "https://firestore.googleapis.com",
  (val) => `http://${val}`
);
export const firestoreOrigin = utils.envOverride(
  "FIRESTORE_URL",
  "https://firestore.googleapis.com"
);
export const functionsOrigin = utils.envOverride(
  "FIREBASE_FUNCTIONS_URL",
  "https://cloudfunctions.googleapis.com"
);
export const functionsUploadRegion = utils.envOverride(
  "FIREBASE_FUNCTIONS_UPLOAD_REGION",
  "us-central1"
);
export const cloudschedulerOrigin = utils.envOverride(
  "FIREBASE_CLOUDSCHEDULER_URL",
  "https://cloudscheduler.googleapis.com"
);
export const pubsubOrigin = utils.envOverride(
  "FIREBASE_PUBSUB_URL",
  "https://pubsub.googleapis.com"
);
export const googleOrigin = utils.envOverride(
  "FIREBASE_TOKEN_URL",
  utils.envOverride("FIREBASE_GOOGLE_URL", "https://www.googleapis.com")
);
export const hostingOrigin = utils.envOverride("FIREBASE_HOSTING_URL", "https://web.app");
export const iamOrigin = utils.envOverride("FIREBASE_IAM_URL", "https://iam.googleapis.com");
export const identityOrigin = utils.envOverride(
  "FIREBASE_IDENTITY_URL",
  "https://identitytoolkit.googleapis.com"
);
export const extensionsOrigin = utils.envOverride(
  "FIREBASE_EXT_URL",
  "https://firebaseextensions.googleapis.com"
);
export const realtimeOriginOrEmulator = utils.envOverride(
  Constants.FIREBASE_DATABASE_EMULATOR_HOST,
  "https://firebaseio.com",
  (val) => `http://${val}`
);
export const rtdbManagementOrigin = utils.envOverride(
  "FIREBASE_RTDB_MANAGEMENT_URL",
  "https://firebasedatabase.googleapis.com"
);
export const realtimeOrigin = utils.envOverride("FIREBASE_REALTIME_URL", "https://firebaseio.com");
export const rtdbMetadataOrigin = utils.envOverride(
  "FIREBASE_RTDB_METADATA_URL",
  "https://metadata-dot-firebase-prod.appspot.com"
);
export const remoteConfigApiOrigin = utils.envOverride(
  "FIREBASE_REMOTE_CONFIG_URL",
  "https://firebaseremoteconfig.googleapis.com"
);
export const resourceManagerOrigin = utils.envOverride(
  "FIREBASE_RESOURCEMANAGER_URL",
  "https://cloudresourcemanager.googleapis.com"
);
export const rulesOrigin = utils.envOverride(
  "FIREBASE_RULES_URL",
  "https://firebaserules.googleapis.com"
);
export const runtimeconfigOrigin = utils.envOverride(
  "FIREBASE_RUNTIMECONFIG_URL",
  "https://runtimeconfig.googleapis.com"
);
export const storageOrigin = utils.envOverride(
  "FIREBASE_STORAGE_URL",
  "https://storage.googleapis.com"
);
export const firebaseStorageOrigin = utils.envOverride(
  "FIREBASE_FIREBASESTORAGE_URL",
  "https://firebasestorage.googleapis.com"
);
export const hostingApiOrigin = utils.envOverride(
  "FIREBASE_HOSTING_API_URL",
  "https://firebasehosting.googleapis.com"
);
export const cloudRunApiOrigin = utils.envOverride(
  "CLOUD_RUN_API_URL",
  "https://run.googleapis.com"
);
export const serviceUsageOrigin = utils.envOverride(
  "FIREBASE_SERVICE_USAGE_URL",
  "https://serviceusage.googleapis.com"
);
export const githubOrigin = utils.envOverride("GITHUB_URL", "https://github.com");
export const githubApiOrigin = utils.envOverride("GITHUB_API_URL", "https://api.github.com");
export const githubClientId = utils.envOverride("GITHUB_CLIENT_ID", "89cf50f02ac6aaed3484");
export const githubClientSecret = utils.envOverride(
  "GITHUB_CLIENT_SECRET",
  "3330d14abc895d9a74d5f17cd7a00711fa2c5bf0"
);

/**
 * Sets the refresh token for request authn/z.
 * @param t a token.
 */
export function setRefreshToken(t = ""): void {
  refreshToken = t;
}

/**
 * Sets the access token for request authn/z.
 * @param t a token.
 */
export function setAccessToken(t = ""): void {
  accessToken = t;
}

/**
 * Gets the scopes for a command.
 * @return the list of scopes.
 */
export function getScopes(): string[] {
  return commandScopes;
}

/**
 * Sets the scopes to use when getting a new token.
 * @param s the list of scopes.
 */
export function setScopes(s: string[] = []): void {
  commandScopes = _.uniq(
    _.flatten(
      [
        scopes.EMAIL,
        scopes.OPENID,
        scopes.CLOUD_PROJECTS_READONLY,
        scopes.FIREBASE_PLATFORM,
      ].concat(s)
    )
  );
  logger.debug("> command requires scopes:", JSON.stringify(commandScopes));
}

/**
 * Gets an access token.
 * @return a token.
 */
export async function getAccessToken(): Promise<string> {
  if (accessToken) return accessToken;
  const r = await require("./auth").getAccessToken(refreshToken, commandScopes);
  return r.access_token;
}

/**
 * Adds headers (including Authz) to a request object.
 * @param reqOptions the request options.
 */
export async function addRequestHeaders(
  reqOptions: requestModule.OptionsWithUrl
): Promise<requestModule.OptionsWithUrl> {
  // Runtime fetch of Auth singleton to prevent circular module dependencies
  _.set(reqOptions, ["headers", "User-Agent"], `FirebaseCLI/${CLI_VERSION}`);
  _.set(reqOptions, ["headers", "X-Client-Version"], `FirebaseCLI/${CLI_VERSION}`);
  const accessToken = await getAccessToken();
  _.set(reqOptions, "headers.authorization", `Bearer ${accessToken}`);
  return reqOptions;
}

/**
 * Make a request for the given resource.
 * @param method HTTP method to use.
 * @param resource resource to fetch.
 * @param options FirebaseRequestOptions.
 */
export async function request(
  method: HttpMethod | string,
  resource: string,
  options: FirebaseRequestOptions
): Promise<FirebaseResponse> {
  options = _.extend(
    {
      data: {},
      resolveOnHTTPError: false, // by default, status codes >= 400 leads to reject
      json: true,
    },
    options
  );

  if (!options.origin) {
    throw new FirebaseError("Cannot make request without an origin", { exit: 2 });
  }

  if (!VALID_METHODS.has(method)) {
    method = HttpMethod.GET;
  }

  if (options.query) {
    resource = appendQueryData(resource, options.query);
  }

  if (method === HttpMethod.GET) {
    resource = appendQueryData(resource, options.data);
  }

  const reqOptions: requestModule.OptionsWithUrl = {
    method: method,
    url: options.origin + resource,
  };

  if (method !== HttpMethod.GET) {
    if (_.size(options.data) > 0) {
      reqOptions.body = options.data;
    } else if (_.size(options.form) > 0) {
      reqOptions.form = options.form;
    }
  }

  reqOptions.json = options.json;
  reqOptions.qs = options.qs;
  reqOptions.headers = options.headers;
  reqOptions.timeout = options.timeout;

  let requestFunction = (): Promise<FirebaseResponse> => {
    return internalRequest(reqOptions, options.logOptions);
  };

  // Only 'https' requests are secure. Protocol includes the final ':'
  // https://developer.mozilla.org/en-US/docs/Web/API/URL/protocol
  const originUrl = url.parse(options.origin);
  const secureRequest = originUrl.protocol === "https:";

  if (options.auth === true) {
    if (secureRequest) {
      requestFunction = async (): Promise<FirebaseResponse> => {
        const reqOptionsWithToken = await addRequestHeaders(reqOptions);
        return internalRequest(reqOptionsWithToken, options.logOptions);
      };
    } else {
      logger.debug(`Ignoring options.auth for insecure origin: ${options.origin}`);
    }
  }

  if (_.size(options.files) > 0) {
    const formData = new FormData();
    _.forEach(options.files, (details, param) => {
      formData.append(param, details.stream, {
        knownLength: details.knownLength,
        filename: details.filename,
        contentType: details.contentType,
      });
    });
    reqOptions.formData = formData;
  }

  let res: FirebaseResponse | undefined;
  while (!res) {
    try {
      res = await requestFunction();
    } catch (err) {
      if (
        options.retryCodes &&
        _.includes(options.retryCodes, _.get(err, "context.response.statusCode"))
      ) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        res = await requestFunction();
      }
      throw err;
    }
  }

  if (res.response.statusCode >= 400 && !options.resolveOnHTTPError) {
    return Promise.reject(responseToError(res.response, res.body));
  }

  return res;
}
