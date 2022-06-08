"use strict";

var _ = require("lodash");
var url = require("url");

var { Constants } = require("./emulator/constants");
const { logger } = require("./logger");
var scopes = require("./scopes");
var utils = require("./utils");
var CLI_VERSION = require("../package.json").version;

var accessToken;
var refreshToken;
var commandScopes;

var api = {
  authProxyOrigin: utils.envOverride("FIREBASE_AUTHPROXY_URL", "https://auth.firebase.tools"),
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
  cloudMonitoringOrigin: utils.envOverride(
    "CLOUD_MONITORING_URL",
    "https://monitoring.googleapis.com"
  ),
  containerRegistryDomain: utils.envOverride("CONTAINER_REGISTRY_DOMAIN", "gcr.io"),
  artifactRegistryDomain: utils.envOverride(
    "ARTIFACT_REGISTRY_DOMAIN",
    "https://artifactregistry.googleapis.com"
  ),
  appDistributionOrigin: utils.envOverride(
    "FIREBASE_APP_DISTRIBUTION_URL",
    "https://firebaseappdistribution.googleapis.com"
  ),
  appengineOrigin: utils.envOverride("FIREBASE_APPENGINE_URL", "https://appengine.googleapis.com"),
  authOrigin: utils.envOverride("FIREBASE_AUTH_URL", "https://accounts.google.com"),
  consoleOrigin: utils.envOverride("FIREBASE_CONSOLE_URL", "https://console.firebase.google.com"),
  deployOrigin: utils.envOverride(
    "FIREBASE_DEPLOY_URL",
    utils.envOverride("FIREBASE_UPLOAD_URL", "https://deploy.firebase.com")
  ),
  dynamicLinksOrigin: utils.envOverride(
    "FIREBASE_DYNAMIC_LINKS_URL",
    "https://firebasedynamiclinks.googleapis.com"
  ),
  dynamicLinksKey: utils.envOverride(
    "FIREBASE_DYNAMIC_LINKS_KEY",
    "AIzaSyB6PtY5vuiSB8MNgt20mQffkOlunZnHYiQ"
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
  functionsV2Origin: utils.envOverride(
    "FIREBASE_FUNCTIONS_V2_URL",
    "https://cloudfunctions.googleapis.com"
  ),
  runOrigin: utils.envOverride("CLOUD_RUN_URL", "https://run.googleapis.com"),
  functionsDefaultRegion: utils.envOverride("FIREBASE_FUNCTIONS_DEFAULT_REGION", "us-central1"),
  cloudschedulerOrigin: utils.envOverride(
    "FIREBASE_CLOUDSCHEDULER_URL",
    "https://cloudscheduler.googleapis.com"
  ),
  cloudTasksOrigin: utils.envOverride(
    "FIREBASE_CLOUD_TAKS_URL",
    "https://cloudtasks.googleapis.com"
  ),
  pubsubOrigin: utils.envOverride("FIREBASE_PUBSUB_URL", "https://pubsub.googleapis.com"),
  googleOrigin: utils.envOverride(
    "FIREBASE_TOKEN_URL",
    utils.envOverride("FIREBASE_GOOGLE_URL", "https://www.googleapis.com")
  ),
  hostingOrigin: utils.envOverride("FIREBASE_HOSTING_URL", "https://web.app"),
  identityOrigin: utils.envOverride(
    "FIREBASE_IDENTITY_URL",
    "https://identitytoolkit.googleapis.com"
  ),
  iamOrigin: utils.envOverride("FIREBASE_IAM_URL", "https://iam.googleapis.com"),
  extensionsOrigin: utils.envOverride(
    "FIREBASE_EXT_URL",
    "https://firebaseextensions.googleapis.com"
  ),
  realtimeOrigin: utils.envOverride("FIREBASE_REALTIME_URL", "https://firebaseio.com"),
  rtdbManagementOrigin: utils.envOverride(
    "FIREBASE_RTDB_MANAGEMENT_URL",
    "https://firebasedatabase.googleapis.com"
  ),
  rtdbMetadataOrigin: utils.envOverride(
    "FIREBASE_RTDB_METADATA_URL",
    "https://metadata-dot-firebase-prod.appspot.com"
  ),
  remoteConfigApiOrigin: utils.envOverride(
    "FIREBASE_REMOTE_CONFIG_URL",
    "https://firebaseremoteconfig.googleapis.com"
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
  githubOrigin: utils.envOverride("GITHUB_URL", "https://github.com"),
  githubApiOrigin: utils.envOverride("GITHUB_API_URL", "https://api.github.com"),
  secretManagerOrigin: utils.envOverride(
    "CLOUD_SECRET_MANAGER_URL",
    "https://secretmanager.googleapis.com"
  ),
  githubClientId: utils.envOverride("GITHUB_CLIENT_ID", "89cf50f02ac6aaed3484"),
  githubClientSecret: utils.envOverride(
    "GITHUB_CLIENT_SECRET",
    "3330d14abc895d9a74d5f17cd7a00711fa2c5bf0"
  ),
  setRefreshToken: function (token) {
    refreshToken = token;
  },
  setAccessToken: function (token) {
    accessToken = token;
  },
  getScopes: function () {
    return commandScopes;
  },
  setScopes: function (s) {
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
  getAccessToken: function () {
    // Runtime fetch of Auth singleton to prevent circular module dependencies
    return accessToken
      ? Promise.resolve({ access_token: accessToken })
      : require("./auth").getAccessToken(refreshToken, commandScopes);
  },
  addRequestHeaders: function (reqOptions, options) {
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

    return getTokenPromise.then(function (result) {
      _.set(reqOptions, "headers.authorization", "Bearer " + result.access_token);
      return reqOptions;
    });
  },
};

module.exports = api;
