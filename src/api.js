"use strict";

var _ = require("lodash");
var querystring = require("querystring");
var request = require("request");
var url = require("url");

var { Constants } = require("./emulator/constants");
var { FirebaseError } = require("./error");
var logger = require("./logger");
var responseToError = require("./responseToError");
var scopes = require("./scopes");
var utils = require("./utils");

var CLI_VERSION = require("../package.json").version;

var accessToken;
var refreshToken;
var commandScopes;

var _request = function(options, logOptions) {
  logOptions = logOptions || {};
  var qsLog = "";
  var bodyLog = "<request body omitted>";

  if (options.qs && !logOptions.skipQueryParams) {
    qsLog = JSON.stringify(options.qs);
  }

  if (!logOptions.skipRequestBody) {
    bodyLog = options.body || options.form || "";
  }

  logger.debug(">>> HTTP REQUEST", options.method, options.url, qsLog, "\n", bodyLog);

  options.headers = options.headers || {};
  options.headers["connection"] = "keep-alive";

  return new Promise(function(resolve, reject) {
    var req = request(options, function(err, response, body) {
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
        if (!options.resolveOnHTTPError) {
          return reject(responseToError(response, body, options));
        }
      }

      return resolve({
        status: response.statusCode,
        response: response,
        body: body,
      });
    });

    if (_.size(options.files) > 0) {
      var form = req.form();
      _.forEach(options.files, function(details, param) {
        form.append(param, details.stream, {
          knownLength: details.knownLength,
          filename: details.filename,
          contentType: details.contentType,
        });
      });
    }
  });
};

var _appendQueryData = function(path, data) {
  if (data && _.size(data) > 0) {
    path += _.includes(path, "?") ? "&" : "?";
    path += querystring.stringify(data);
  }
  return path;
};

var api = {
  // "In this context, the client secret is obviously not treated as a secret"
  // https://developers.google.com/identity/protocols/OAuth2InstalledApp
  clientId: utils.envOverride(
    "FIREBASE_CLIENT_ID",
    "563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com"
  ),
  clientSecret: utils.envOverride("FIREBASE_CLIENT_SECRET", "j9iVZfS8kkCEFUPaAeJV0sAi"),
  cloudbillingOrigin: utils.envOverride(
    "FIREBASE_CLOUDBILLING_URL",
    "https://cloudbilling.googleapis.com"
  ),
  cloudloggingOrigin: utils.envOverride(
    "FIREBASE_CLOUDLOGGING_URL",
    "https://logging.googleapis.com"
  ),
  appDistributionOrigin: utils.envOverride(
    "FIREBASE_APP_DISTRIBUTION_URL",
    "https://firebaseappdistribution.googleapis.com"
  ),
  appDistributionUploadOrigin: utils.envOverride(
    "FIREBASE_APP_DISTRIBUTION_UPLOAD_URL",
    "https://appdistribution-uploads.crashlytics.com"
  ),
  appengineOrigin: utils.envOverride("FIREBASE_APPENGINE_URL", "https://appengine.googleapis.com"),
  authOrigin: utils.envOverride("FIREBASE_AUTH_URL", "https://accounts.google.com"),
  consoleOrigin: utils.envOverride("FIREBASE_CONSOLE_URL", "https://console.firebase.google.com"),
  deployOrigin: utils.envOverride(
    "FIREBASE_DEPLOY_URL",
    utils.envOverride("FIREBASE_UPLOAD_URL", "https://deploy.firebase.com")
  ),
  firebaseApiOrigin: utils.envOverride("FIREBASE_API_URL", "https://firebase.googleapis.com"),
  firebaseExtensionsRegistryOrigin: utils.envOverride(
    "FIREBASE_EXT_REGISTRY_ORIGIN",
    "https://extensions-registry.firebaseapp.com"
  ),
  firedataOrigin: utils.envOverride("FIREBASE_FIREDATA_URL", "https://mobilesdk-pa.googleapis.com"),
  firestoreOriginOrEmulator: utils.envOverride(
    Constants.FIRESTORE_EMULATOR_HOST,
    utils.envOverride("FIRESTORE_URL", "https://firestore.googleapis.com"),
    (val) => {
      if (val.startsWith("http")) {
        return val;
      }
      return `http://${val}`;
    }
  ),
  firestoreOrigin: utils.envOverride("FIRESTORE_URL", "https://firestore.googleapis.com"),
  functionsOrigin: utils.envOverride(
    "FIREBASE_FUNCTIONS_URL",
    "https://cloudfunctions.googleapis.com"
  ),
  cloudschedulerOrigin: utils.envOverride(
    "FIREBASE_CLOUDSCHEDULER_URL",
    "https://cloudscheduler.googleapis.com"
  ),
  pubsubOrigin: utils.envOverride("FIREBASE_PUBSUB_URL", "https://pubsub.googleapis.com"),
  googleOrigin: utils.envOverride(
    "FIREBASE_TOKEN_URL",
    utils.envOverride("FIREBASE_GOOGLE_URL", "https://www.googleapis.com")
  ),
  hostingOrigin: utils.envOverride("FIREBASE_HOSTING_URL", "https://web.app"),
  iamOrigin: utils.envOverride("FIREBASE_IAM_URL", "https://iam.googleapis.com"),
  extensionsOrigin: utils.envOverride(
    "FIREBASE_EXT_URL",
    "https://firebaseextensions.googleapis.com"
  ),
  realtimeOriginOrEmulator: utils.envOverride(
    Constants.FIREBASE_DATABASE_EMULATOR_HOST,
    utils.envOverride("FIREBASE_REALTIME_URL", "https://firebaseio.com"),
    (val) => {
      if (val.startsWith("http")) {
        return val;
      }
      return `http://${val}`;
    }
  ),
  realtimeOrigin: utils.envOverride("FIREBASE_REALTIME_URL", "https://firebaseio.com"),
  rtdbMetadataOrigin: utils.envOverride(
    "FIREBASE_RTDB_METADATA_URL",
    "https://metadata-dot-firebase-prod.appspot.com"
  ),
  resourceManagerOrigin: utils.envOverride(
    "FIREBASE_RESOURCEMANAGER_URL",
    "https://cloudresourcemanager.googleapis.com"
  ),
  rulesOrigin: utils.envOverride("FIREBASE_RULES_URL", "https://firebaserules.googleapis.com"),
  runtimeconfigOrigin: utils.envOverride(
    "FIREBASE_RUNTIMECONFIG_URL",
    "https://runtimeconfig.googleapis.com"
  ),
  storageOrigin: utils.envOverride("FIREBASE_STORAGE_URL", "https://storage.googleapis.com"),
  firebaseStorageOrigin: utils.envOverride(
    "FIREBASE_FIREBASESTORAGE_URL",
    "https://firebasestorage.googleapis.com"
  ),
  hostingApiOrigin: utils.envOverride(
    "FIREBASE_HOSTING_API_URL",
    "https://firebasehosting.googleapis.com"
  ),
  cloudRunApiOrigin: utils.envOverride("CLOUD_RUN_API_URL", "https://run.googleapis.com"),
  serviceUsageOrigin: utils.envOverride(
    "FIREBASE_SERVICE_USAGE_URL",
    "https://serviceusage.googleapis.com"
  ),

  setRefreshToken: function(token) {
    refreshToken = token;
  },
  setAccessToken: function(token) {
    accessToken = token;
  },
  getScopes: function() {
    return commandScopes;
  },
  setScopes: function(s) {
    commandScopes = _.uniq(
      _.flatten(
        [
          scopes.EMAIL,
          scopes.OPENID,
          scopes.CLOUD_PROJECTS_READONLY,
          scopes.FIREBASE_PLATFORM,
        ].concat(s || [])
      )
    );
    logger.debug("> command requires scopes:", JSON.stringify(commandScopes));
  },
  getAccessToken: function() {
    // Runtime fetch of Auth singleton to prevent circular module dependencies
    return accessToken
      ? Promise.resolve({ access_token: accessToken })
      : require("./auth").getAccessToken(refreshToken, commandScopes);
  },
  addRequestHeaders: function(reqOptions, options) {
    _.set(reqOptions, ["headers", "User-Agent"], "FirebaseCLI/" + CLI_VERSION);
    _.set(reqOptions, ["headers", "X-Client-Version"], "FirebaseCLI/" + CLI_VERSION);

    var secureRequest = true;
    if (options && options.origin) {
      // Only 'https' requests are secure. Protocol includes the final ':'
      // https://developer.mozilla.org/en-US/docs/Web/API/URL/protocol
      const originUrl = url.parse(options.origin);
      secureRequest = originUrl.protocol === "https:";
    }

    // For insecure requests we send a special 'owner" token which the emulators
    // will accept and other secure APIs will deny.
    var getTokenPromise = secureRequest
      ? api.getAccessToken()
      : Promise.resolve({ access_token: "owner" });

    return getTokenPromise.then(function(result) {
      _.set(reqOptions, "headers.authorization", "Bearer " + result.access_token);
      return reqOptions;
    });
  },
  request: function(method, resource, options) {
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

    var validMethods = ["GET", "PUT", "POST", "DELETE", "PATCH"];

    if (validMethods.indexOf(method) < 0) {
      method = "GET";
    }

    var reqOptions = {
      method: method,
    };

    if (options.query) {
      resource = _appendQueryData(resource, options.query);
    }

    if (method === "GET") {
      resource = _appendQueryData(resource, options.data);
    } else {
      if (_.size(options.data) > 0) {
        reqOptions.body = options.data;
      } else if (_.size(options.form) > 0) {
        reqOptions.form = options.form;
      }
    }

    reqOptions.url = options.origin + resource;
    reqOptions.files = options.files;
    reqOptions.resolveOnHTTPError = options.resolveOnHTTPError;
    reqOptions.json = options.json;
    reqOptions.qs = options.qs;
    reqOptions.headers = options.headers;
    reqOptions.timeout = options.timeout;

    var requestFunction = function() {
      return _request(reqOptions, options.logOptions);
    };

    if (options.auth === true) {
      requestFunction = function() {
        return api.addRequestHeaders(reqOptions, options).then(function(reqOptionsWithToken) {
          return _request(reqOptionsWithToken, options.logOptions);
        });
      };
    }

    return requestFunction().catch(function(err) {
      if (
        options.retryCodes &&
        _.includes(options.retryCodes, _.get(err, "context.response.statusCode"))
      ) {
        return new Promise(function(resolve) {
          setTimeout(resolve, 1000);
        }).then(requestFunction);
      }
      return Promise.reject(err);
    });
  },
};

module.exports = api;
