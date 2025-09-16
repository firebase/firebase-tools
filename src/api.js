"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.storageOrigin = exports.runtimeconfigOrigin = exports.rulesOrigin = exports.resourceManagerOrigin = exports.crashlyticsApiOrigin = exports.messagingApiOrigin = exports.remoteConfigApiOrigin = exports.rtdbMetadataOrigin = exports.rtdbManagementOrigin = exports.realtimeOrigin = exports.extensionsTOSOrigin = exports.extensionsPublisherOrigin = exports.extensionsOrigin = exports.iamOrigin = exports.identityOrigin = exports.hostingOrigin = exports.googleOrigin = exports.pubsubOrigin = exports.cloudTasksOrigin = exports.cloudschedulerOrigin = exports.cloudbuildOrigin = exports.functionsDefaultRegion = exports.runOrigin = exports.functionsV2Origin = exports.functionsOrigin = exports.firestoreOrigin = exports.firestoreOriginOrEmulator = exports.firedataOrigin = exports.firebaseExtensionsRegistryOrigin = exports.firebaseApiOrigin = exports.eventarcOrigin = exports.dynamicLinksKey = exports.dynamicLinksOrigin = exports.consoleOrigin = exports.authManagementOrigin = exports.authOrigin = exports.apphostingGitHubAppInstallationURL = exports.apphostingP4SADomain = exports.apphostingOrigin = exports.appDistributionOrigin = exports.artifactRegistryDomain = exports.developerConnectP4SADomain = exports.developerConnectOrigin = exports.containerRegistryDomain = exports.cloudMonitoringOrigin = exports.cloudloggingOrigin = exports.cloudbillingOrigin = exports.clientSecret = exports.clientId = exports.authProxyOrigin = void 0;
exports.setScopes = exports.getScopes = exports.appTestingOrigin = exports.cloudAiCompanionOrigin = exports.vertexAIOrigin = exports.cloudSQLAdminOrigin = exports.dataConnectLocalConnString = exports.dataconnectP4SADomain = exports.dataconnectOrigin = exports.githubClientSecret = exports.githubClientId = exports.computeOrigin = exports.secretManagerOrigin = exports.githubApiOrigin = exports.githubOrigin = exports.studioApiOrigin = exports.serviceUsageOrigin = exports.cloudRunApiOrigin = exports.hostingApiOrigin = exports.firebaseStorageOrigin = void 0;
const constants_1 = require("./emulator/constants");
const logger_1 = require("./logger");
const scopes = __importStar(require("./scopes"));
const utils = __importStar(require("./utils"));
let commandScopes = new Set();
const authProxyOrigin = () => utils.envOverride("FIREBASE_AUTHPROXY_URL", "https://auth.firebase.tools");
exports.authProxyOrigin = authProxyOrigin;
// "In this context, the client secret is obviously not treated as a secret"
// https://developers.google.com/identity/protocols/OAuth2InstalledApp
const clientId = () => utils.envOverride("FIREBASE_CLIENT_ID", "563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com");
exports.clientId = clientId;
const clientSecret = () => utils.envOverride("FIREBASE_CLIENT_SECRET", "j9iVZfS8kkCEFUPaAeJV0sAi");
exports.clientSecret = clientSecret;
const cloudbillingOrigin = () => utils.envOverride("FIREBASE_CLOUDBILLING_URL", "https://cloudbilling.googleapis.com");
exports.cloudbillingOrigin = cloudbillingOrigin;
const cloudloggingOrigin = () => utils.envOverride("FIREBASE_CLOUDLOGGING_URL", "https://logging.googleapis.com");
exports.cloudloggingOrigin = cloudloggingOrigin;
const cloudMonitoringOrigin = () => utils.envOverride("CLOUD_MONITORING_URL", "https://monitoring.googleapis.com");
exports.cloudMonitoringOrigin = cloudMonitoringOrigin;
const containerRegistryDomain = () => utils.envOverride("CONTAINER_REGISTRY_DOMAIN", "gcr.io");
exports.containerRegistryDomain = containerRegistryDomain;
const developerConnectOrigin = () => utils.envOverride("DEVELOPERCONNECT_URL", "https://developerconnect.googleapis.com");
exports.developerConnectOrigin = developerConnectOrigin;
const developerConnectP4SADomain = () => utils.envOverride("DEVELOPERCONNECT_P4SA_DOMAIN", "gcp-sa-devconnect.iam.gserviceaccount.com");
exports.developerConnectP4SADomain = developerConnectP4SADomain;
const artifactRegistryDomain = () => utils.envOverride("ARTIFACT_REGISTRY_DOMAIN", "https://artifactregistry.googleapis.com");
exports.artifactRegistryDomain = artifactRegistryDomain;
const appDistributionOrigin = () => utils.envOverride("FIREBASE_APP_DISTRIBUTION_URL", "https://firebaseappdistribution.googleapis.com");
exports.appDistributionOrigin = appDistributionOrigin;
const apphostingOrigin = () => utils.envOverride("FIREBASE_APPHOSTING_URL", "https://firebaseapphosting.googleapis.com");
exports.apphostingOrigin = apphostingOrigin;
const apphostingP4SADomain = () => utils.envOverride("FIREBASE_APPHOSTING_P4SA_DOMAIN", "gcp-sa-firebaseapphosting.iam.gserviceaccount.com");
exports.apphostingP4SADomain = apphostingP4SADomain;
const apphostingGitHubAppInstallationURL = () => utils.envOverride("FIREBASE_APPHOSTING_GITHUB_INSTALLATION_URL", "https://github.com/apps/firebase-app-hosting/installations/new");
exports.apphostingGitHubAppInstallationURL = apphostingGitHubAppInstallationURL;
const authOrigin = () => utils.envOverride("FIREBASE_AUTH_URL", "https://accounts.google.com");
exports.authOrigin = authOrigin;
const authManagementOrigin = () => utils.envOverride("FIREBASE_AUTH_MANAGEMENT_URL", "https://identitytoolkit.googleapis.com");
exports.authManagementOrigin = authManagementOrigin;
const consoleOrigin = () => utils.envOverride("FIREBASE_CONSOLE_URL", "https://console.firebase.google.com");
exports.consoleOrigin = consoleOrigin;
const dynamicLinksOrigin = () => utils.envOverride("FIREBASE_DYNAMIC_LINKS_URL", "https://firebasedynamiclinks.googleapis.com");
exports.dynamicLinksOrigin = dynamicLinksOrigin;
const dynamicLinksKey = () => utils.envOverride("FIREBASE_DYNAMIC_LINKS_KEY", "AIzaSyB6PtY5vuiSB8MNgt20mQffkOlunZnHYiQ");
exports.dynamicLinksKey = dynamicLinksKey;
const eventarcOrigin = () => utils.envOverride("EVENTARC_URL", "https://eventarc.googleapis.com");
exports.eventarcOrigin = eventarcOrigin;
const firebaseApiOrigin = () => utils.envOverride("FIREBASE_API_URL", "https://firebase.googleapis.com");
exports.firebaseApiOrigin = firebaseApiOrigin;
const firebaseExtensionsRegistryOrigin = () => utils.envOverride("FIREBASE_EXT_REGISTRY_ORIGIN", "https://extensions-registry.firebaseapp.com");
exports.firebaseExtensionsRegistryOrigin = firebaseExtensionsRegistryOrigin;
const firedataOrigin = () => utils.envOverride("FIREBASE_FIREDATA_URL", "https://mobilesdk-pa.googleapis.com");
exports.firedataOrigin = firedataOrigin;
const firestoreOriginOrEmulator = () => utils.envOverride(constants_1.Constants.FIRESTORE_EMULATOR_HOST, utils.envOverride("FIRESTORE_URL", "https://firestore.googleapis.com"), (val) => {
    if (val.startsWith("http")) {
        return val;
    }
    return `http://${val}`;
});
exports.firestoreOriginOrEmulator = firestoreOriginOrEmulator;
const firestoreOrigin = () => utils.envOverride("FIRESTORE_URL", "https://firestore.googleapis.com");
exports.firestoreOrigin = firestoreOrigin;
const functionsOrigin = () => utils.envOverride("FIREBASE_FUNCTIONS_URL", "https://cloudfunctions.googleapis.com");
exports.functionsOrigin = functionsOrigin;
const functionsV2Origin = () => utils.envOverride("FIREBASE_FUNCTIONS_V2_URL", "https://cloudfunctions.googleapis.com");
exports.functionsV2Origin = functionsV2Origin;
const runOrigin = () => utils.envOverride("CLOUD_RUN_URL", "https://run.googleapis.com");
exports.runOrigin = runOrigin;
const functionsDefaultRegion = () => utils.envOverride("FIREBASE_FUNCTIONS_DEFAULT_REGION", "us-central1");
exports.functionsDefaultRegion = functionsDefaultRegion;
const cloudbuildOrigin = () => utils.envOverride("FIREBASE_CLOUDBUILD_URL", "https://cloudbuild.googleapis.com");
exports.cloudbuildOrigin = cloudbuildOrigin;
const cloudschedulerOrigin = () => utils.envOverride("FIREBASE_CLOUDSCHEDULER_URL", "https://cloudscheduler.googleapis.com");
exports.cloudschedulerOrigin = cloudschedulerOrigin;
const cloudTasksOrigin = () => utils.envOverride("FIREBASE_CLOUD_TAKS_URL", "https://cloudtasks.googleapis.com");
exports.cloudTasksOrigin = cloudTasksOrigin;
const pubsubOrigin = () => utils.envOverride("FIREBASE_PUBSUB_URL", "https://pubsub.googleapis.com");
exports.pubsubOrigin = pubsubOrigin;
const googleOrigin = () => utils.envOverride("FIREBASE_TOKEN_URL", utils.envOverride("FIREBASE_GOOGLE_URL", "https://www.googleapis.com"));
exports.googleOrigin = googleOrigin;
const hostingOrigin = () => utils.envOverride("FIREBASE_HOSTING_URL", "https://web.app");
exports.hostingOrigin = hostingOrigin;
const identityOrigin = () => utils.envOverride("FIREBASE_IDENTITY_URL", "https://identitytoolkit.googleapis.com");
exports.identityOrigin = identityOrigin;
const iamOrigin = () => utils.envOverride("FIREBASE_IAM_URL", "https://iam.googleapis.com");
exports.iamOrigin = iamOrigin;
const extensionsOrigin = () => utils.envOverride("FIREBASE_EXT_URL", "https://firebaseextensions.googleapis.com");
exports.extensionsOrigin = extensionsOrigin;
const extensionsPublisherOrigin = () => utils.envOverride("FIREBASE_EXT_PUBLISHER_URL", "https://firebaseextensionspublisher.googleapis.com");
exports.extensionsPublisherOrigin = extensionsPublisherOrigin;
const extensionsTOSOrigin = () => utils.envOverride("FIREBASE_EXT_TOS_URL", "https://firebaseextensionstos-pa.googleapis.com");
exports.extensionsTOSOrigin = extensionsTOSOrigin;
const realtimeOrigin = () => utils.envOverride("FIREBASE_REALTIME_URL", "https://firebaseio.com");
exports.realtimeOrigin = realtimeOrigin;
const rtdbManagementOrigin = () => utils.envOverride("FIREBASE_RTDB_MANAGEMENT_URL", "https://firebasedatabase.googleapis.com");
exports.rtdbManagementOrigin = rtdbManagementOrigin;
const rtdbMetadataOrigin = () => utils.envOverride("FIREBASE_RTDB_METADATA_URL", "https://metadata-dot-firebase-prod.appspot.com");
exports.rtdbMetadataOrigin = rtdbMetadataOrigin;
const remoteConfigApiOrigin = () => utils.envOverride("FIREBASE_REMOTE_CONFIG_URL", "https://firebaseremoteconfig.googleapis.com");
exports.remoteConfigApiOrigin = remoteConfigApiOrigin;
const messagingApiOrigin = () => utils.envOverride("FIREBASE_MESSAGING_CONFIG_URL", "https://fcm.googleapis.com");
exports.messagingApiOrigin = messagingApiOrigin;
const crashlyticsApiOrigin = () => utils.envOverride("FIREBASE_CRASHLYTICS_URL", "https://firebasecrashlytics.googleapis.com");
exports.crashlyticsApiOrigin = crashlyticsApiOrigin;
const resourceManagerOrigin = () => utils.envOverride("FIREBASE_RESOURCEMANAGER_URL", "https://cloudresourcemanager.googleapis.com");
exports.resourceManagerOrigin = resourceManagerOrigin;
const rulesOrigin = () => utils.envOverride("FIREBASE_RULES_URL", "https://firebaserules.googleapis.com");
exports.rulesOrigin = rulesOrigin;
const runtimeconfigOrigin = () => utils.envOverride("FIREBASE_RUNTIMECONFIG_URL", "https://runtimeconfig.googleapis.com");
exports.runtimeconfigOrigin = runtimeconfigOrigin;
const storageOrigin = () => utils.envOverride("FIREBASE_STORAGE_URL", "https://storage.googleapis.com");
exports.storageOrigin = storageOrigin;
const firebaseStorageOrigin = () => utils.envOverride("FIREBASE_FIREBASESTORAGE_URL", "https://firebasestorage.googleapis.com");
exports.firebaseStorageOrigin = firebaseStorageOrigin;
const hostingApiOrigin = () => utils.envOverride("FIREBASE_HOSTING_API_URL", "https://firebasehosting.googleapis.com");
exports.hostingApiOrigin = hostingApiOrigin;
const cloudRunApiOrigin = () => utils.envOverride("CLOUD_RUN_API_URL", "https://run.googleapis.com");
exports.cloudRunApiOrigin = cloudRunApiOrigin;
const serviceUsageOrigin = () => utils.envOverride("FIREBASE_SERVICE_USAGE_URL", "https://serviceusage.googleapis.com");
exports.serviceUsageOrigin = serviceUsageOrigin;
const studioApiOrigin = () => utils.envOverride("FIREBASE_STUDIO_URL", "https://monospace-pa.googleapis.com");
exports.studioApiOrigin = studioApiOrigin;
const githubOrigin = () => utils.envOverride("GITHUB_URL", "https://github.com");
exports.githubOrigin = githubOrigin;
const githubApiOrigin = () => utils.envOverride("GITHUB_API_URL", "https://api.github.com");
exports.githubApiOrigin = githubApiOrigin;
const secretManagerOrigin = () => utils.envOverride("CLOUD_SECRET_MANAGER_URL", "https://secretmanager.googleapis.com");
exports.secretManagerOrigin = secretManagerOrigin;
const computeOrigin = () => utils.envOverride("COMPUTE_URL", "https://compute.googleapis.com");
exports.computeOrigin = computeOrigin;
const githubClientId = () => utils.envOverride("GITHUB_CLIENT_ID", "89cf50f02ac6aaed3484");
exports.githubClientId = githubClientId;
const githubClientSecret = () => utils.envOverride("GITHUB_CLIENT_SECRET", "3330d14abc895d9a74d5f17cd7a00711fa2c5bf0");
exports.githubClientSecret = githubClientSecret;
const dataconnectOrigin = () => utils.envOverride("FIREBASE_DATACONNECT_URL", "https://firebasedataconnect.googleapis.com");
exports.dataconnectOrigin = dataconnectOrigin;
const dataconnectP4SADomain = () => utils.envOverride("FIREBASE_DATACONNECT_P4SA_DOMAIN", "gcp-sa-firebasedataconnect.iam.gserviceaccount.com");
exports.dataconnectP4SADomain = dataconnectP4SADomain;
const dataConnectLocalConnString = () => utils.envOverride("FIREBASE_DATACONNECT_POSTGRESQL_STRING", "");
exports.dataConnectLocalConnString = dataConnectLocalConnString;
const cloudSQLAdminOrigin = () => utils.envOverride("CLOUD_SQL_URL", "https://sqladmin.googleapis.com");
exports.cloudSQLAdminOrigin = cloudSQLAdminOrigin;
const vertexAIOrigin = () => utils.envOverride("VERTEX_AI_URL", "https://aiplatform.googleapis.com");
exports.vertexAIOrigin = vertexAIOrigin;
const cloudAiCompanionOrigin = () => utils.envOverride("CLOUD_AI_COMPANION_URL", "https://cloudaicompanion.googleapis.com");
exports.cloudAiCompanionOrigin = cloudAiCompanionOrigin;
const appTestingOrigin = () => utils.envOverride("FIREBASE_APP_TESTING_URL", "https://firebaseapptesting.googleapis.com");
exports.appTestingOrigin = appTestingOrigin;
/** Gets scopes that have been set. */
function getScopes() {
    return Array.from(commandScopes);
}
exports.getScopes = getScopes;
/** Sets scopes for API calls. */
function setScopes(sps = []) {
    commandScopes = new Set([
        scopes.EMAIL,
        scopes.OPENID,
        scopes.CLOUD_PROJECTS_READONLY,
        scopes.FIREBASE_PLATFORM,
    ]);
    for (const s of sps) {
        commandScopes.add(s);
    }
    logger_1.logger.debug("> command requires scopes:", Array.from(commandScopes));
}
exports.setScopes = setScopes;
//# sourceMappingURL=api.js.map