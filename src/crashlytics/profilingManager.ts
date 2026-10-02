import { Client } from "../apiv2";
import { crashlyticsApiOrigin } from "../api";
import { FirebaseError, getErrStatus } from "../error";
import { logger } from "../logger";
import { parseProjectNumber, TIMEOUT } from "./utils";
import * as storage from "../gcp/storage";
import * as resourceManager from "../gcp/resourceManager";
import * as serviceusage from "../gcp/serviceusage";
import { AndroidAppMetadata, AppPlatform, listFirebaseApps } from "../management/apps";
import { select } from "../prompt";

export function getCrashlyticsV1Client(): Client {
  return new Client({
    urlPrefix: crashlyticsApiOrigin(),
    apiVersion: "v1",
  });
}

export const CRASHLYTICS_SERVICE_NAME = "firebasecrashlytics.googleapis.com";
export const STORAGE_OBJECT_CREATOR_ROLE = "roles/storage.objectCreator";
export const DEFAULT_CORS_ORIGINS = ["https://console.firebase.google.com"];
export const DEFAULT_BUCKET_LOCATION = "us-east1";
export const DEFAULT_FILE_TTL_DAYS = 90;

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
 * Creates a deterministic GCS bucket name for the given GMP App ID.
 * Follows the convention: firebasecrashlytics-heap-dumps-${hashedPackageName}
 * @param appId GMP App ID (e.g. 1:123456789:android:abcdef123456)
 */
export function createBucketName(appId: string): string {
  const appIdSplit = appId.split(":");
  if (appIdSplit.length < 4 || appIdSplit[2] !== "android") {
    throw new FirebaseError(
      `App ID ${appId} is not a valid Android app ID. Heap dump collection is only supported for Android apps.`,
    );
  }
  const hashedPackageName = appIdSplit[3].toLowerCase();
  return `firebasecrashlytics-heap-dumps-${hashedPackageName}`;
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
    const appIdParts = options.app.split(":");
    if (appIdParts.length < 4 || appIdParts[2] !== "android") {
      throw new FirebaseError(
        `App ID '${options.app}' is not a valid Android app ID. Heap dump collection is only supported for Android apps.`,
      );
    }
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

  const choices = (apps as AndroidAppMetadata[]).map((app) => ({
    name: `${app.displayName || app.packageName || app.appId} (${app.appId})`,
    value: app.appId,
  }));

  return await select<string>({
    message: "Select an Android app:",
    choices,
  });
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
  const corsRules: storage.CorsRule[] = [
    {
      origin: DEFAULT_CORS_ORIGINS,
      method: ["GET", "HEAD", "OPTIONS"],
      responseHeader: ["Content-Type", "Access-Control-Allow-Origin", "Content-Length"],
    },
  ];
  const lifecycle: { rule: storage.LifecycleRule[] } = {
    rule: [
      {
        action: { type: "Delete" },
        condition: { age: DEFAULT_FILE_TTL_DAYS },
      },
    ],
  };

  try {
    const bucket = await storage.getBucket(bucketName);
    const patchPayload: Partial<storage.BucketResponse> = {};
    if (!bucket.cors || bucket.cors.length === 0) {
      patchPayload.cors = corsRules;
    }
    if (!bucket.lifecycle?.rule || bucket.lifecycle.rule.length === 0) {
      patchPayload.lifecycle = lifecycle;
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
      cors: corsRules,
      lifecycle,
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
