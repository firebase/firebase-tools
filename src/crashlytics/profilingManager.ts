import { FirebaseError, getErrStatus } from "../error";
import { logger } from "../logger";
import { logLabeledBullet, logLabeledSuccess } from "../utils";
import { CRASHLYTICS_API_CLIENT, parseProjectNumber, TIMEOUT } from "./utils";
import * as storage from "../gcp/storage";
import * as serviceusage from "../gcp/serviceusage";
import { AppPlatform, listFirebaseApps, selectAppInteractively } from "../management/apps";

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
export const DEFAULT_IAM_CONFIGURATION: storage.BucketIamConfiguration = {
  publicAccessPrevention: "enforced",
  uniformBucketLevelAccess: { enabled: true },
};

const ANDROID_APP_ID_REGEX = /^\d+:(\d+):android:([a-fA-F0-9]+)$/;
const GCS_BUCKET_RESOURCE_PREFIX = "projects/_/buckets/";

export interface ProfilingManagerConfig {
  name?: string;
  bucket?: string;
  heapDumpCollectionEnabled?: boolean;
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
 * Resolves and validates the Android app ID from options.app against the project,
 * or interactively prompts if multiple Android apps exist.
 */
export async function resolveAndroidAppId(
  projectId: string,
  options: { app?: string; nonInteractive?: boolean },
): Promise<string> {
  const requestedAppId = options.app;
  if (requestedAppId) {
    parseAndroidHashedId(requestedAppId);
  }

  const apps = await listFirebaseApps(projectId, AppPlatform.ANDROID);
  if (requestedAppId) {
    const matchedApp = apps.find((app) => app.appId.toLowerCase() === requestedAppId.toLowerCase());
    if (!matchedApp) {
      throw new FirebaseError(
        `Android app '${requestedAppId}' was not found in project '${projectId}'. ` +
          "Run 'firebase apps:list ANDROID' to view valid Android app IDs for your project.",
        { exit: 1 },
      );
    }
    return matchedApp.appId;
  }
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
  const response = await CRASHLYTICS_API_CLIENT.request<void, ProfilingManagerConfig>({
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
    path: `/projects/${projectNumber}/apps/${appId}/profilingManagerConfig`,
    timeout: TIMEOUT,
  });
  return response.body;
}

/**
 * Updates the Crashlytics Profiling Manager configuration for an app.
 * @param appId GMP App ID
 * @param config Profiling manager configuration fields to update
 * @param updateMask Comma-separated field mask of fields to update
 */
export async function updateProfilingManagerConfig(
  appId: string,
  config: ProfilingManagerConfig,
  updateMask: string,
): Promise<void> {
  const projectNumber = parseProjectNumber(appId);
  logger.debug(
    `[crashlytics] updateProfilingManagerConfig called with appId: ${appId}, config: ${JSON.stringify(config)}, updateMask: ${updateMask}`,
  );
  await CRASHLYTICS_API_CLIENT.request<ProfilingManagerConfig, void>({
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    path: `/projects/${projectNumber}/apps/${appId}/profilingManagerConfig`,
    queryParams: { updateMask },
    body: config,
    timeout: TIMEOUT,
  });
}

/**
 * Ensures the GCS bucket for heap dumps exists and is configured with CORS, 90-day file TTL,
 * Uniform Bucket-Level Access, and enforced Public Access Prevention.
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
    const needsUbla = !bucket.iamConfiguration?.uniformBucketLevelAccess?.enabled;
    const needsPap = bucket.iamConfiguration?.publicAccessPrevention !== "enforced";
    if (needsUbla || needsPap) {
      patchPayload.iamConfiguration = {
        ...(needsPap ? { publicAccessPrevention: "enforced" } : {}),
        ...(needsUbla ? { uniformBucketLevelAccess: { enabled: true } } : {}),
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
  await storage.createBucket(projectId, {
    name: bucketName,
    location,
    cors: DEFAULT_CORS_RULES,
    lifecycle: { rule: DEFAULT_LIFECYCLE_RULES },
    iamConfiguration: DEFAULT_IAM_CONFIGURATION,
  });
  return bucketName;
}

/**
 * Generates the Crashlytics service identity and grants roles/storage.objectCreator on the heap dump bucket.
 * @param projectNumber Cloud Project Number
 * @param bucketName Target Cloud Storage bucket name
 */
export async function ensureHeapDumpP4saRole(
  projectNumber: string,
  bucketName: string,
): Promise<void> {
  await serviceusage.generateServiceIdentityAndPoll(
    projectNumber,
    CRASHLYTICS_SERVICE_NAME,
    "crashlytics",
  );
  const p4saEmail = getCrashlyticsP4sa(projectNumber);
  logger.debug(
    `[crashlytics] Ensuring ${STORAGE_OBJECT_CREATOR_ROLE} on bucket ${bucketName} for ${p4saEmail}...`,
  );
  await storage.addServiceAccountToBucketRoles(bucketName, p4saEmail, [
    STORAGE_OBJECT_CREATOR_ROLE,
  ]);
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
  await ensureHeapDumpP4saRole(projectNumber, bucketName);
  logLabeledBullet("crashlytics", "Enabling Crashlytics heap dump collection...");
  await updateProfilingManagerConfig(
    appId,
    {
      bucket: `${GCS_BUCKET_RESOURCE_PREFIX}${bucketName}`,
      heapDumpCollectionEnabled: true,
    },
    "bucket,heapDumpCollectionEnabled",
  );
  logLabeledSuccess("crashlytics", "Successfully enabled Crashlytics heap dump collection!");
  return bucketName;
}

/**
 * Disables heap dump collection for the specified Android app while preserving its bucket configuration.
 * @param appId GMP App ID
 */
export async function disableHeapDumpCollection(appId: string): Promise<void> {
  logLabeledBullet("crashlytics", "Disabling Crashlytics heap dump collection...");
  await updateProfilingManagerConfig(
    appId,
    {
      heapDumpCollectionEnabled: false,
    },
    "heapDumpCollectionEnabled",
  );
  logLabeledSuccess("crashlytics", "Successfully disabled Crashlytics heap dump collection!");
}
