import { Client } from "../apiv2";
import { crashlyticsApiOrigin } from "../api";
import { FirebaseError, getErrStatus } from "../error";
import { logger } from "../logger";
import { logLabeledBullet, logLabeledSuccess } from "../utils";
import { parseProjectNumber, TIMEOUT } from "./utils";
import * as storage from "../gcp/storage";
import * as resourceManager from "../gcp/resourceManager";
import * as serviceusage from "../gcp/serviceusage";
import { AppPlatform, listFirebaseApps, selectAppInteractively } from "../management/apps";

/**
 * Returns an authenticated v1 API client for the Firebase Crashlytics API.
 */
export function getCrashlyticsV1Client(): Client {
  return new Client({
    urlPrefix: crashlyticsApiOrigin(),
    apiVersion: "v1",
  });
}

export const CRASHLYTICS_SERVICE_NAME = "firebasecrashlytics.googleapis.com";
export const STORAGE_OBJECT_CREATOR_ROLE = "roles/storage.objectCreator";
export const HEAP_DUMP_BUCKET_PREFIX = "firebasecrashlytics-heap-dumps-";
export const DEFAULT_CORS_ORIGINS = ["https://console.firebase.google.com"];
export const DEFAULT_BUCKET_LOCATION = "us-east1";
export const DEFAULT_FILE_TTL_DAYS = 90;
export const DEFAULT_CORS_RULES: storage.CorsRule[] = [
  {
    origin: DEFAULT_CORS_ORIGINS,
    method: ["GET", "HEAD", "OPTIONS"],
    responseHeader: ["Content-Type", "Access-Control-Allow-Origin", "Content-Length"],
  },
];
export const DEFAULT_LIFECYCLE_RULES: storage.LifecycleRule[] = [
  {
    action: { type: "Delete" },
    condition: { age: DEFAULT_FILE_TTL_DAYS },
  },
];

const ANDROID_APP_ID_REGEX = /^\d+:(\d+):android:([a-fA-F0-9]+)$/;

export interface ProfilingManagerConfig {
  gcsBucket?: string;
  heapDumpCollectionEnabled?: boolean;
}

export interface GetProfilingManagerConfigResponse {
  configuration?: ProfilingManagerConfig;
}

export interface UpdateProfilingManagerConfigRequest {
  projectNumber: string;
  gmpAppId: string;
  configuration: {
    gcsBucket: string;
    heapDumpCollectionEnabled: boolean;
  };
}

/**
 * Validates an Android GMP App ID and returns its lowercased hashed package name segment.
 * @param appId GMP App ID (e.g. 1:123456789:android:abcdef123456)
 */
export function parseAndroidHashedId(appId: string): string {
  const match = ANDROID_APP_ID_REGEX.exec(appId);
  if (!match) {
    throw new FirebaseError(
      `App ID '${appId}' is not a valid Android app ID (expected format '1:<project-number>:android:<hash>'). ` +
        "Heap dump collection is only supported for Android apps. " +
        "Run 'firebase apps:list ANDROID' to view valid Android app IDs for your project.",
    );
  }
  return match[2].toLowerCase();
}

/**
 * Creates a deterministic GCS bucket name for the given GMP App ID.
 * Follows the convention: firebasecrashlytics-heap-dumps-${hashedPackageName}
 * @param appId GMP App ID (e.g. 1:123456789:android:abcdef123456)
 */
export function createBucketName(appId: string): string {
  return `${HEAP_DUMP_BUCKET_PREFIX}${parseAndroidHashedId(appId)}`;
}

/**
 * Returns the Crashlytics P4SA (service agent) email for the given project number.
 * https://firebase.google.com/support/guides/service-accounts
 */
export function getCrashlyticsP4sa(projectNumber: string): string {
  return `service-${projectNumber}@gcp-sa-crashlytics.iam.gserviceaccount.com`;
}

/**
 * Resolves the Android app ID from options.app, or interactively prompts if multiple exist.
 */
export async function resolveAndroidAppId(
  projectId: string,
  options: { app?: string; nonInteractive?: boolean },
): Promise<string> {
  if (options.app) {
    parseAndroidHashedId(options.app);
    return options.app;
  }

  const apps = await listFirebaseApps(projectId, AppPlatform.ANDROID);
  if (apps.length === 0) {
    throw new FirebaseError(
      `No Android apps found in project '${projectId}'. Heap dump collection is only supported for Android apps.\n` +
        "You can register an Android app using 'firebase apps:create ANDROID <package-name>'",
    );
  }

  if (apps.length === 1) {
    return apps[0].appId;
  }

  if (options.nonInteractive) {
    throw new FirebaseError(
      `Project '${projectId}' has multiple Android apps. Please specify an app ID with '--app <appID>'.`,
    );
  }

  const selectedApp = await selectAppInteractively(apps, AppPlatform.ANDROID, {
    message: "Select an Android app:",
  });
  return selectedApp.appId;
}

/**
 * Fetches the Crashlytics Profiling Manager configuration for an app.
 * @param appId GMP App ID
 */
export async function getProfilingManagerConfig(appId: string): Promise<ProfilingManagerConfig> {
  const projectNumber = parseProjectNumber(appId);
  logger.debug(`[crashlytics] getProfilingManagerConfig called with appId: ${appId}`);
  const response = await getCrashlyticsV1Client().request<void, GetProfilingManagerConfigResponse>({
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
    path: `/projects/${projectNumber}/apps/${appId}/appconfig:profilingManager`,
    timeout: TIMEOUT,
  });
  const config = response.body?.configuration || {};
  return {
    gcsBucket: config.gcsBucket || "",
    heapDumpCollectionEnabled: config.heapDumpCollectionEnabled ?? false,
  };
}

/**
 * Updates the Crashlytics Profiling Manager configuration for an app.
 * @param appId GMP App ID
 * @param config Profiling manager configuration
 */
export async function updateProfilingManagerConfig(
  appId: string,
  config: ProfilingManagerConfig,
): Promise<void> {
  const projectNumber = parseProjectNumber(appId);
  logger.debug(
    `[crashlytics] updateProfilingManagerConfig called with appId: ${appId}, config: ${JSON.stringify(config)}`,
  );
  await getCrashlyticsV1Client().request<UpdateProfilingManagerConfigRequest, void>({
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    path: `/projects/${projectNumber}/apps/${appId}/appconfig:profilingManager`,
    body: {
      projectNumber,
      gmpAppId: appId,
      configuration: {
        gcsBucket: config.gcsBucket ?? "",
        heapDumpCollectionEnabled: config.heapDumpCollectionEnabled ?? false,
      },
    },
    timeout: TIMEOUT,
  });
}

/**
 * Ensures the GCS bucket for heap dumps exists and is configured with CORS and 90-day file TTL.
 * Creates the bucket if it does not already exist.
 * @param projectId Cloud Project ID
 * @param appId GMP App ID
 * @param location Bucket location / region
 */
export async function ensureHeapDumpStorageBucket(
  projectId: string,
  appId: string,
  location: string = DEFAULT_BUCKET_LOCATION,
): Promise<string> {
  const bucketName = createBucketName(appId);
  const projectNumber = parseProjectNumber(appId);

  try {
    const bucket = await storage.getBucket(bucketName);
    if (bucket.projectNumber && String(bucket.projectNumber) !== projectNumber) {
      throw new FirebaseError(
        `Cloud Storage bucket '${bucketName}' already exists and is owned by another project.`,
      );
    }
    const patchPayload: Partial<storage.BucketResponse> = {};
    const hasConsoleCors = bucket.cors?.some((rule) =>
      DEFAULT_CORS_ORIGINS.every((origin) => rule.origin?.includes(origin)),
    );
    if (!hasConsoleCors) {
      patchPayload.cors = [...(bucket.cors ?? []), ...DEFAULT_CORS_RULES];
    }
    const hasDeleteLifecycle = bucket.lifecycle?.rule?.some(
      (rule) => rule.action.type === "Delete" && rule.condition.age !== undefined,
    );
    if (!hasDeleteLifecycle) {
      patchPayload.lifecycle = {
        rule: [...(bucket.lifecycle?.rule ?? []), ...DEFAULT_LIFECYCLE_RULES],
      };
    }
    if (Object.keys(patchPayload).length > 0) {
      logger.debug(
        `[crashlytics] Bucket ${bucketName} found without full configuration. Patching ${Object.keys(patchPayload).join(", ")}.`,
      );
      await storage.patchBucket(bucketName, patchPayload);
    }
    return bucketName;
  } catch (err: unknown) {
    const status = getErrStatus(err);
    if (status !== 404) {
      throw err;
    }
  }

  logger.debug(`[crashlytics] Creating GCS bucket ${bucketName} in ${location}...`);
  await storage.createBucket(
    projectId,
    {
      name: bucketName,
      location,
      cors: DEFAULT_CORS_RULES,
      lifecycle: { rule: DEFAULT_LIFECYCLE_RULES },
    },
    true /* projectPrivate */,
  );
  return bucketName;
}

/**
 * Generates the Crashlytics service identity and ensures the P4SA has the roles/storage.objectCreator role.
 * @param projectId Cloud Project ID
 * @param projectNumber Cloud Project Number
 */
export async function ensureHeapDumpP4saRole(
  projectId: string,
  projectNumber: string,
): Promise<void> {
  await serviceusage.generateServiceIdentityAndPoll(
    projectNumber,
    CRASHLYTICS_SERVICE_NAME,
    "crashlytics",
  );
  const p4saEmail = getCrashlyticsP4sa(projectNumber);
  const hasRole = await resourceManager.serviceAccountHasRoles(
    projectId,
    p4saEmail,
    [STORAGE_OBJECT_CREATOR_ROLE],
    true /* skipAccountLookup */,
  );
  if (!hasRole) {
    logger.debug(`[crashlytics] Adding ${STORAGE_OBJECT_CREATOR_ROLE} to ${p4saEmail}...`);
    await resourceManager.addServiceAccountToRoles(
      projectId,
      p4saEmail,
      [STORAGE_OBJECT_CREATOR_ROLE],
      true /* skipAccountLookup */,
    );
  }
}

/**
 * Provisions the GCS bucket, configures Crashlytics service agent permissions,
 * and enables heap dump collection for the specified Android app.
 * @param projectId Cloud Project ID
 * @param appId GMP App ID
 * @param location Bucket location / region
 */
export async function enableHeapDumpCollection(
  projectId: string,
  appId: string,
  location: string = DEFAULT_BUCKET_LOCATION,
): Promise<string> {
  const projectNumber = parseProjectNumber(appId);
  logLabeledBullet("crashlytics", "Configuring Google Cloud Storage bucket...");
  const bucketName = await ensureHeapDumpStorageBucket(projectId, appId, location);
  logLabeledBullet("crashlytics", "Configuring service agent permissions...");
  await ensureHeapDumpP4saRole(projectId, projectNumber);
  logLabeledBullet("crashlytics", "Enabling Crashlytics heap dump collection...");
  await updateProfilingManagerConfig(appId, {
    gcsBucket: bucketName,
    heapDumpCollectionEnabled: true,
  });
  logLabeledSuccess("crashlytics", "Successfully enabled Crashlytics heap dump collection!");
  return bucketName;
}

/**
 * Disables heap dump collection for the specified Android app while preserving its bucket configuration.
 * @param appId GMP App ID
 */
export async function disableHeapDumpCollection(appId: string): Promise<void> {
  logLabeledBullet("crashlytics", "Disabling Crashlytics heap dump collection...");
  const currentConfig = await getProfilingManagerConfig(appId);
  await updateProfilingManagerConfig(appId, {
    gcsBucket: currentConfig.gcsBucket,
    heapDumpCollectionEnabled: false,
  });
  logLabeledSuccess("crashlytics", "Successfully disabled Crashlytics heap dump collection!");
}
