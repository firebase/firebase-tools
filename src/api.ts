import { Constants } from "./emulator/constants";
import { logger } from "./logger";
import * as scopes from "./scopes";
import * as utils from "./utils";

let commandScopes = new Set<string>();

export const authProxyOrigin = utils.envOverride(
  "FIREBASE_AUTHPROXY_URL",
  "https://auth.firebase.tools",
);
// "In this context, the client secret is obviously not treated as a secret"
// https://developers.google.com/identity/protocols/OAuth2InstalledApp
export const clientId = utils.envOverride(
  "FIREBASE_CLIENT_ID",
  "563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com",
);
export const clientSecret = utils.envOverride("FIREBASE_CLIENT_SECRET", "j9iVZfS8kkCEFUPaAeJV0sAi");
export const cloudbillingOrigin = utils.envOverride(
  "FIREBASE_CLOUDBILLING_URL",
  "https://cloudbilling.googleapis.com",
);
export const cloudloggingOrigin = utils.envOverride(
  "FIREBASE_CLOUDLOGGING_URL",
  "https://logging.googleapis.com",
);
export const cloudMonitoringOrigin = utils.envOverride(
  "CLOUD_MONITORING_URL",
  "https://monitoring.googleapis.com",
);
export const containerRegistryDomain = utils.envOverride("CONTAINER_REGISTRY_DOMAIN", "gcr.io");
export const artifactRegistryDomain = utils.envOverride(
  "ARTIFACT_REGISTRY_DOMAIN",
  "https://artifactregistry.googleapis.com",
);
export const appDistributionOrigin = utils.envOverride(
  "FIREBASE_APP_DISTRIBUTION_URL",
  "https://firebaseappdistribution.googleapis.com",
);
export const authOrigin = utils.envOverride("FIREBASE_AUTH_URL", "https://accounts.google.com");
export const consoleOrigin = utils.envOverride(
  "FIREBASE_CONSOLE_URL",
  "https://console.firebase.google.com",
);
export const deployOrigin = utils.envOverride(
  "FIREBASE_DEPLOY_URL",
  utils.envOverride("FIREBASE_UPLOAD_URL", "https://deploy.firebase.com"),
);
export const dynamicLinksOrigin = utils.envOverride(
  "FIREBASE_DYNAMIC_LINKS_URL",
  "https://firebasedynamiclinks.googleapis.com",
);
export const dynamicLinksKey = utils.envOverride(
  "FIREBASE_DYNAMIC_LINKS_KEY",
  "AIzaSyB6PtY5vuiSB8MNgt20mQffkOlunZnHYiQ",
);
export const eventarcOrigin = utils.envOverride("EVENTARC_URL", "https://eventarc.googleapis.com");
export const firebaseApiOrigin = utils.envOverride(
  "FIREBASE_API_URL",
  "https://firebase.googleapis.com",
);
export const firebaseExtensionsRegistryOrigin = utils.envOverride(
  "FIREBASE_EXT_REGISTRY_ORIGIN",
  "https://extensions-registry.firebaseapp.com",
);
export const firedataOrigin = utils.envOverride(
  "FIREBASE_FIREDATA_URL",
  "https://mobilesdk-pa.googleapis.com",
);
export const firestoreOriginOrEmulator = utils.envOverride(
  Constants.FIRESTORE_EMULATOR_HOST,
  utils.envOverride("FIRESTORE_URL", "https://firestore.googleapis.com"),
  (val) => {
    if (val.startsWith("http")) {
      return val;
    }
    return `http://${val}`;
  },
);
export const firestoreOrigin = utils.envOverride(
  "FIRESTORE_URL",
  "https://firestore.googleapis.com",
);
export const functionsOrigin = utils.envOverride(
  "FIREBASE_FUNCTIONS_URL",
  "https://cloudfunctions.googleapis.com",
);
export const functionsV2Origin = utils.envOverride(
  "FIREBASE_FUNCTIONS_V2_URL",
  "https://cloudfunctions.googleapis.com",
);
export const runOrigin = utils.envOverride("CLOUD_RUN_URL", "https://run.googleapis.com");
export const functionsDefaultRegion = utils.envOverride(
  "FIREBASE_FUNCTIONS_DEFAULT_REGION",
  "us-central1",
);

export const cloudbuildOrigin = utils.envOverride(
  "FIREBASE_CLOUDBUILD_URL",
  "https://cloudbuild.googleapis.com",
);

export const cloudschedulerOrigin = utils.envOverride(
  "FIREBASE_CLOUDSCHEDULER_URL",
  "https://cloudscheduler.googleapis.com",
);
export const cloudTasksOrigin = utils.envOverride(
  "FIREBASE_CLOUD_TAKS_URL",
  "https://cloudtasks.googleapis.com",
);
export const pubsubOrigin = utils.envOverride(
  "FIREBASE_PUBSUB_URL",
  "https://pubsub.googleapis.com",
);
export const googleOrigin = utils.envOverride(
  "FIREBASE_TOKEN_URL",
  utils.envOverride("FIREBASE_GOOGLE_URL", "https://www.googleapis.com"),
);
export const hostingOrigin = utils.envOverride("FIREBASE_HOSTING_URL", "https://web.app");
export const identityOrigin = utils.envOverride(
  "FIREBASE_IDENTITY_URL",
  "https://identitytoolkit.googleapis.com",
);
export const iamOrigin = utils.envOverride("FIREBASE_IAM_URL", "https://iam.googleapis.com");
export const extensionsOrigin = utils.envOverride(
  "FIREBASE_EXT_URL",
  "https://firebaseextensions.googleapis.com",
);
export const extensionsPublisherOrigin = utils.envOverride(
  "FIREBASE_EXT_PUBLISHER_URL",
  "https://firebaseextensionspublisher.googleapis.com",
);
export const extensionsTOSOrigin = utils.envOverride(
  "FIREBASE_EXT_TOS_URL",
  "https://firebaseextensionstos-pa.googleapis.com",
);
export const realtimeOrigin = utils.envOverride("FIREBASE_REALTIME_URL", "https://firebaseio.com");
export const rtdbManagementOrigin = utils.envOverride(
  "FIREBASE_RTDB_MANAGEMENT_URL",
  "https://firebasedatabase.googleapis.com",
);
export const rtdbMetadataOrigin = utils.envOverride(
  "FIREBASE_RTDB_METADATA_URL",
  "https://metadata-dot-firebase-prod.appspot.com",
);
export const remoteConfigApiOrigin = utils.envOverride(
  "FIREBASE_REMOTE_CONFIG_URL",
  "https://firebaseremoteconfig.googleapis.com",
);
export const resourceManagerOrigin = utils.envOverride(
  "FIREBASE_RESOURCEMANAGER_URL",
  "https://cloudresourcemanager.googleapis.com",
);
export const rulesOrigin = utils.envOverride(
  "FIREBASE_RULES_URL",
  "https://firebaserules.googleapis.com",
);
export const runtimeconfigOrigin = utils.envOverride(
  "FIREBASE_RUNTIMECONFIG_URL",
  "https://runtimeconfig.googleapis.com",
);
export const storageOrigin = utils.envOverride(
  "FIREBASE_STORAGE_URL",
  "https://storage.googleapis.com",
);
export const firebaseStorageOrigin = utils.envOverride(
  "FIREBASE_FIREBASESTORAGE_URL",
  "https://firebasestorage.googleapis.com",
);
export const hostingApiOrigin = utils.envOverride(
  "FIREBASE_HOSTING_API_URL",
  "https://firebasehosting.googleapis.com",
);
export const cloudRunApiOrigin = utils.envOverride(
  "CLOUD_RUN_API_URL",
  "https://run.googleapis.com",
);
export const serviceUsageOrigin = utils.envOverride(
  "FIREBASE_SERVICE_USAGE_URL",
  "https://serviceusage.googleapis.com",
);
export const apphostingOrigin = utils.envOverride(
  "APPHOSTING_URL",
  "https://firebaseapphosting.googleapis.com",
);
export const githubOrigin = utils.envOverride("GITHUB_URL", "https://github.com");
export const githubApiOrigin = utils.envOverride("GITHUB_API_URL", "https://api.github.com");
export const secretManagerOrigin = utils.envOverride(
  "CLOUD_SECRET_MANAGER_URL",
  "https://secretmanager.googleapis.com",
);
export const githubClientId = utils.envOverride("GITHUB_CLIENT_ID", "89cf50f02ac6aaed3484");
export const githubClientSecret = utils.envOverride(
  "GITHUB_CLIENT_SECRET",
  "3330d14abc895d9a74d5f17cd7a00711fa2c5bf0",
);

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
