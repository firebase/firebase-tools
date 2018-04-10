"use strict";

var _ = require("lodash");
var querystring = require("querystring");
var request = require("request");

var FirebaseError = require("./error");
var logger = require("./logger");
var responseToError = require("./responseToError");
var scopes = require("./scopes");
var utils = require("./utils");

var CLI_VERSION = require("../package.json").version;

var accessToken;
var refreshToken;
var commandScopes;

var _request = function(options) {
  logger.debug(
    ">>> HTTP REQUEST",
    options.method,
    options.url,
    options.qs ? "\nquery params: " + JSON.stringify(options.qs) : "",
    "\n",
    options.body || options.form || "",
    "\n",
    new Date().toString()
  );

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

      if (response.statusCode >= 400) {
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
  cloudloggingOrigin: utils.envOverride(
    "FIREBASE_CLOUDLOGGING_URL",
    "https://logging.googleapis.com"
  ),
  adminOrigin: utils.envOverride("FIREBASE_ADMIN_URL", "https://admin.firebase.com"),
  appengineOrigin: utils.envOverride("FIREBASE_APPENGINE_URL", "https://appengine.googleapis.com"),
  authOrigin: utils.envOverride("FIREBASE_AUTH_URL", "https://accounts.google.com"),
  consoleOrigin: utils.envOverride("FIREBASE_CONSOLE_URL", "https://console.firebase.google.com"),
  deployOrigin: utils.envOverride(
    "FIREBASE_DEPLOY_URL",
    utils.envOverride("FIREBASE_UPLOAD_URL", "https://deploy.firebase.com")
  ),
  firedataOrigin: utils.envOverride("FIREBASE_FIREDATA_URL", "https://mobilesdk-pa.googleapis.com"),
  firestoreOrigin: utils.envOverride("FIRESTORE_URL", "https://firestore.googleapis.com"),
  functionsOrigin: utils.envOverride(
    "FIREBASE_FUNCTIONS_URL",
    "https://cloudfunctions.googleapis.com"
  ),
  googleOrigin: utils.envOverride(
    "FIREBASE_TOKEN_URL",
    utils.envOverride("FIREBASE_GOOGLE_URL", "https://www.googleapis.com")
  ),
  hostingOrigin: utils.envOverride("FIREBASE_HOSTING_URL", "https://firebaseapp.com"),
  realtimeOrigin: utils.envOverride("FIREBASE_REALTIME_URL", "https://firebaseio.com"),
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

  setRefreshToken: function(token) {
    refreshToken = token;
  },
  setAccessToken: function(token) {
    accessToken = token;
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
    return accessToken
      ? Promise.resolve({ access_token: accessToken })
      : require("./auth").getAccessToken(refreshToken, commandScopes);
  },
  addRequestHeaders: function(reqOptions) {
    // Runtime fetch of Auth singleton to prevent circular module dependencies
    _.set(reqOptions, ["headers", "User-Agent"], "FirebaseCLI/" + CLI_VERSION);
    _.set(reqOptions, ["headers", "X-Client-Version"], "FirebaseCLI/" + CLI_VERSION);
    return api.getAccessToken().then(function(result) {
      _.set(reqOptions, "headers.authorization", "Bearer " + result.access_token);
      return reqOptions;
    });
  },
  request: function(method, resource, options) {
    options = _.extend(
      {
        data: {},
        origin: api.adminOrigin, // default to hitting the admin backend
        resolveOnHTTPError: false, // by default, status codes >= 400 leads to reject
        json: true,
      },
      options
    );

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

    if (options.auth === true) {
      return api.addRequestHeaders(reqOptions).then(function(reqOptionsWithToken) {
        return _request(reqOptionsWithToken);
      });
    }

    return _request(reqOptions);
  },
  getProject: function(projectId) {
    return api
      .request("GET", "/v1/projects/" + encodeURIComponent(projectId), {
        auth: true,
      })
      .then(function(res) {
        if (res.body && !res.body.error) {
          return res.body;
        }

        return Promise.reject(
          new FirebaseError("Server Error: Unexpected Response. Please try again", {
            context: res,
            exit: 2,
          })
        );
      });
  },
  getProjects: function() {
    return api
      .request("GET", "/v1/projects", {
        auth: true,
      })
      .then(function(res) {
        if (res.body && res.body.projects) {
          return res.body.projects;
        }

        return Promise.reject(
          new FirebaseError("Server Error: Unexpected Response. Please try again", {
            context: res,
            exit: 2,
          })
        );
      });
  },
};

module.exports = api;
