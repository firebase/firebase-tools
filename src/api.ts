import { Constants } from "./emulator/constants";
import { logger } from "./logger";
import * as scopes from "./scopes";
import * as utils from "./utils";

let commandScopes = new Set<string>();

export const authProxyOrigin = (): string =>
  utils.envOverride("FIREBASE_AUTHPROXY_URL", "https://auth.firebase.tools");
// "In this context, the client secret is obviously not treated as a secret"
// https://developers.google.com/identity/protocols/OAuth2InstalledApp
export const clientId = (): string =>
  utils.envOverride(
    "FIREBASE_CLIENT_ID",
    "563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com",
  );
export const clientSecret = (): string =>
  utils.envOverride("FIREBASE_CLIENT_SECRET", "j9iVZfS8kkCEFUPaAeJV0sAi");
export const cloudbillingOrigin = (): string =>
  utils.envOverride("FIREBASE_CLOUDBILLING_URL", "https://cloudbilling.googleapis.com");
export const cloudloggingOrigin = (): string =>
  utils.envOverride("FIREBASE_CLOUDLOGGING_URL", "https://logging.googleapis.com");
export const cloudMonitoringOrigin = (): string =>
  utils.envOverride("CLOUD_MONITORING_URL", "https://monitoring.googleapis.com");
export const containerRegistryDomain = (): string =>
  utils.envOverride("CONTAINER_REGISTRY_DOMAIN", "gcr.io");

export const developerConnectOrigin = (): string =>
  utils.envOverride("DEVELOPERCONNECT_URL", "https://developerconnect.googleapis.com");
export const developerConnectP4SADomain = (): string =>
  utils.envOverride("DEVELOPERCONNECT_P4SA_DOMAIN", "gcp-sa-devconnect.iam.gserviceaccount.com");

export const artifactRegistryDomain = (): string =>
  utils.envOverride("ARTIFACT_REGISTRY_DOMAIN", "https://artifactregistry.googleapis.com");
export const apiKeysOrigin = (): string =>
  utils.envOverride("CLOUD_APIKEYS_URL", "https://apikeys.googleapis.com");
export const appCheckOrigin = (): string =>
  utils.envOverride("FIREBASE_APPCHECK_URL", "https://firebaseappcheck.googleapis.com");
export const appDistributionOrigin = (): string =>
  utils.envOverride(
    "FIREBASE_APP_DISTRIBUTION_URL",
    "https://firebaseappdistribution.googleapis.com",
  );
export const apphostingOrigin = (): string =>
  utils.envOverride("FIREBASE_APPHOSTING_URL", "https://firebaseapphosting.googleapis.com");
export const apphostingP4SADomain = (): string =>
  utils.envOverride(
    "FIREBASE_APPHOSTING_P4SA_DOMAIN",
    "gcp-sa-firebaseapphosting.iam.gserviceaccount.com",
  );
export const apphostingGitHubAppInstallationURL = (): string =>
  utils.envOverride(
    "FIREBASE_APPHOSTING_GITHUB_INSTALLATION_URL",
    "https://github.com/apps/firebase-app-hosting/installations/new",
  );

export const authOrigin = (): string =>
  utils.envOverride("FIREBASE_AUTH_URL", "https://accounts.google.com");
export const authManagementOrigin = (): string =>
  utils.envOverride("FIREBASE_AUTH_MANAGEMENT_URL", "https://identitytoolkit.googleapis.com");
export const consoleOrigin = (): string =>
  utils.envOverride("FIREBASE_CONSOLE_URL", "https://console.firebase.google.com");
export const eventarcOrigin = (): string =>
  utils.envOverride("EVENTARC_URL", "https://eventarc.googleapis.com");
export const firebaseApiOrigin = (): string =>
  utils.envOverride("FIREBASE_API_URL", "https://firebase.googleapis.com");
export const firebaseExtensionsRegistryOrigin = (): string =>
  utils.envOverride("FIREBASE_EXT_REGISTRY_ORIGIN", "https://extensions-registry.firebaseapp.com");
export const firedataOrigin = (): string =>
  utils.envOverride("FIREBASE_FIREDATA_URL", "https://mobilesdk-pa.googleapis.com");
export const firestoreOriginOrEmulator = (): string =>
  utils.envOverride(
    Constants.FIRESTORE_EMULATOR_HOST,
    utils.envOverride("FIRESTORE_URL", "https://firestore.googleapis.com"),
    (val) => {
      if (val.startsWith("http")) {
        return val;
      }
      return `http://${val}`;
    },
  );
export const firestoreOrigin = (): string =>
  utils.envOverride("FIRESTORE_URL", "https://firestore.googleapis.com");
export const functionsOrigin = (): string =>
  utils.envOverride("FIREBASE_FUNCTIONS_URL", "https://cloudfunctions.googleapis.com");
export const functionsV2Origin = (): string =>
  utils.envOverride("FIREBASE_FUNCTIONS_V2_URL", "https://cloudfunctions.googleapis.com");
export const runOrigin = (): string =>
  utils.envOverride("CLOUD_RUN_URL", "https://run.googleapis.com");
export const functionsDefaultRegion = (): string =>
  utils.envOverride("FIREBASE_FUNCTIONS_DEFAULT_REGION", "REGION_TBD");

export const cloudbuildOrigin = (): string =>
  utils.envOverride("FIREBASE_CLOUDBUILD_URL", "https://cloudbuild.googleapis.com");
export const cloudschedulerOrigin = (): string =>
  utils.envOverride("FIREBASE_CLOUDSCHEDULER_URL", "https://cloudscheduler.googleapis.com");
export const cloudTasksOrigin = (): string =>
  utils.envOverride("FIREBASE_CLOUD_TAKS_URL", "https://cloudtasks.googleapis.com");
export const pubsubOrigin = (): string =>
  utils.envOverride("FIREBASE_PUBSUB_URL", "https://pubsub.googleapis.com");
export const googleOrigin = (): string =>
  utils.envOverride(
    "FIREBASE_TOKEN_URL",
    utils.envOverride("FIREBASE_GOOGLE_URL", "https://www.googleapis.com"),
  );
export const hostingOrigin = (): string =>
  utils.envOverride("FIREBASE_HOSTING_URL", "https://web.app");
export const identityOrigin = (): string =>
  utils.envOverride("FIREBASE_IDENTITY_URL", "https://identitytoolkit.googleapis.com");
export const iamOrigin = (): string =>
  utils.envOverride("FIREBASE_IAM_URL", "https://iam.googleapis.com");
export const extensionsOrigin = (): string =>
  utils.envOverride("FIREBASE_EXT_URL", "https://firebaseextensions.googleapis.com");
export const extensionsPublisherOrigin = (): string =>
  utils.envOverride(
    "FIREBASE_EXT_PUBLISHER_URL",
    "https://firebaseextensionspublisher.googleapis.com",
  );
export const extensionsTOSOrigin = (): string =>
  utils.envOverride("FIREBASE_EXT_TOS_URL", "https://firebaseextensionstos-pa.googleapis.com");
export const realtimeOrigin = (): string =>
  utils.envOverride("FIREBASE_REALTIME_URL", "https://firebaseio.com");
export const rtdbManagementOrigin = (): string =>
  utils.envOverride("FIREBASE_RTDB_MANAGEMENT_URL", "https://firebasedatabase.googleapis.com");
export const rtdbMetadataOrigin = (): string =>
  utils.envOverride("FIREBASE_RTDB_METADATA_URL", "https://metadata-dot-firebase-prod.appspot.com");
export const remoteConfigApiOrigin = (): string =>
  utils.envOverride("FIREBASE_REMOTE_CONFIG_URL", "https://firebaseremoteconfig.googleapis.com");
export const messagingApiOrigin = (): string =>
  utils.envOverride("FIREBASE_MESSAGING_CONFIG_URL", "https://fcm.googleapis.com");
export const crashlyticsApiOrigin = (): string =>
  utils.envOverride("FIREBASE_CRASHLYTICS_URL", "https://firebasecrashlytics.googleapis.com");
export const firebaseTelemetryOrigin = (): string =>
  utils.envOverride("FIREBASE_TELEMETRY_URL", "https://firebasetelemetry.googleapis.com");
export const firebaseTelemetryAdminOrigin = (): string =>
  utils.envOverride(
    "FIREBASE_TELEMETRY_ADMIN_URL",
    "https://firebasetelemetryadmin.googleapis.com",
  );
export const resourceManagerOrigin = (): string =>
  utils.envOverride("FIREBASE_RESOURCEMANAGER_URL", "https://cloudresourcemanager.googleapis.com");
export const rulesOrigin = (): string =>
  utils.envOverride("FIREBASE_RULES_URL", "https://firebaserules.googleapis.com");
export const runtimeconfigOrigin = (): string =>
  utils.envOverride("FIREBASE_RUNTIMECONFIG_URL", "https://runtimeconfig.googleapis.com");
export const storageOrigin = (): string =>
  utils.envOverride("FIREBASE_STORAGE_URL", "https://storage.googleapis.com");
export const firebaseStorageOrigin = (): string =>
  utils.envOverride("FIREBASE_FIREBASESTORAGE_URL", "https://firebasestorage.googleapis.com");
export const hostingApiOrigin = (): string =>
  utils.envOverride("FIREBASE_HOSTING_API_URL", "https://firebasehosting.googleapis.com");
export const cloudRunApiOrigin = (): string =>
  utils.envOverride("CLOUD_RUN_API_URL", "https://run.googleapis.com");
export const serviceUsageOrigin = (): string =>
  utils.envOverride("FIREBASE_SERVICE_USAGE_URL", "https://serviceusage.googleapis.com");
export const studioApiOrigin = (): string =>
  utils.envOverride("FIREBASE_STUDIO_URL", "https://monospace-pa.googleapis.com");

export const githubOrigin = (): string => utils.envOverride("GITHUB_URL", "https://github.com");
export const githubApiOrigin = (): string =>
  utils.envOverride("GITHUB_API_URL", "https://api.github.com");
export const secretManagerOrigin = (): string =>
  utils.envOverride("CLOUD_SECRET_MANAGER_URL", "https://secretmanager.googleapis.com");
export const computeOrigin = (): string =>
  utils.envOverride("COMPUTE_URL", "https://compute.googleapis.com");
export const githubClientId = (): string =>
  utils.envOverride("GITHUB_CLIENT_ID", "89cf50f02ac6aaed3484");
export const githubClientSecret = (): string =>
  utils.envOverride("GITHUB_CLIENT_SECRET", "3330d14abc895d9a74d5f17cd7a00711fa2c5bf0");

export const dataconnectOrigin = (): string =>
  utils.envOverride("FIREBASE_DATACONNECT_URL", "https://firebasedataconnect.googleapis.com");
export const dataconnectP4SADomain = (): string =>
  utils.envOverride(
    "FIREBASE_DATACONNECT_P4SA_DOMAIN",
    "gcp-sa-firebasedataconnect.iam.gserviceaccount.com",
  );
export const dataConnectLocalConnString = (): string =>
  utils.envOverride("FIREBASE_DATACONNECT_POSTGRESQL_STRING", "");
export const cloudSQLAdminOrigin = (): string =>
  utils.envOverride("CLOUD_SQL_URL", "https://sqladmin.googleapis.com");
export const vertexAIOrigin = (): string =>
  utils.envOverride("VERTEX_AI_URL", "https://aiplatform.googleapis.com");
export const aiLogicProxyOrigin = (): string =>
  utils.envOverride("AI_LOGIC_PROXY_URL", "https://firebasevertexai.googleapis.com");

export const appTestingOrigin = (): string =>
  utils.envOverride("FIREBASE_APP_TESTING_URL", "https://firebaseapptesting.googleapis.com");
export const cloudTestingOrigin = (): string =>
  utils.envOverride("CLOUD_TESTING_URL", "https://testing.googleapis.com");

export const developerKnowledgeOrigin = (): string =>
  utils.envOverride("DEVELOPER_KNOWLEDGE_URL", "https://developerknowledge.googleapis.com");

/** Gets scopes that have been set. */
export function getScopes(): string[] {
  return Array.from(commandScopes);
}

/** Sets scopes for API calls. */
export function setScopes(sps: string[] = []): void {
  commandScopes = new Set<string>([
    scopes.EMAIL,
    scopes.OPENID,
    scopes.CLOUD_PROJECTS_READONLY,
    scopes.FIREBASE_PLATFORM,
  ]);
  for (const s of sps) {
    commandScopes.add(s);
  }
  logger.debug("> command requires scopes:", Array.from(commandScopes));
}
