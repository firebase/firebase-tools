import { firebaseApiOrigin } from "../api";
import * as apiv2 from "../apiv2";
import { configstore } from "../configstore";
import { FirebaseError } from "../error";
import { logger } from "../logger";
import { Constants } from "./constants";

export type AdminSdkConfig = {
  projectId: string;
  databaseURL?: string;
  storageBucket?: string;
  locationId?: string;
};

const _CONFIGSTORE_KEY = "adminsdkconfig";

/**
 * When all else fails we can "guess" the AdminSdkConfig, although this is likely to
 * be incorrect.
 */
export function constructDefaultAdminSdkConfig(projectId: string): AdminSdkConfig {
  // Do our best to provide reasonable FIREBASE_CONFIG, based on firebase-functions implementation
  // https://github.com/firebase/firebase-functions/blob/59d6a7e056a7244e700dc7b6a180e25b38b647fd/src/setup.ts#L45
  return {
    projectId: projectId,
    databaseURL: process.env.DATABASE_URL || `https://${projectId}.firebaseio.com`,
    storageBucket: process.env.STORAGE_BUCKET_URL || `${projectId}.appspot.com`,
  };
}

/**
 * Get the Admin SDK configuration associated with a project, falling back to a cache when offline.
 */
export async function getProjectAdminSdkConfigOrCached(
  projectId: string,
): Promise<AdminSdkConfig | undefined> {
  // When using the emulators with a fake project Id, use a fake project config.
  if (Constants.isDemoProject(projectId)) {
    return constructDefaultAdminSdkConfig(projectId);
  }

  try {
    const config = await getProjectAdminSdkConfig(projectId);
    setCacheAdminSdkConfig(projectId, config);
    return config;
  } catch (e: any) {
    logger.debug(`Failed to get Admin SDK config for ${projectId}, falling back to cache`, e);
    return getCachedAdminSdkConfig(projectId);
  }
}

/**
 * Gets the Admin SDK configuration associated with a project.
 */
async function getProjectAdminSdkConfig(projectId: string): Promise<AdminSdkConfig> {
  const apiClient = new apiv2.Client({
    auth: true,
    apiVersion: "v1beta1",
    urlPrefix: firebaseApiOrigin,
  });
  if (projectId.startsWith("demo-")) {
    logger.debug(
      `Detected demo- project: ${projectId}. Using default adminSdkConfig instead of calling firebase API.`,
    );
    return {
      projectId,
      databaseURL: `${projectId}-default-rtdb.firebaseio.com`,
      storageBucket: `${projectId}.appspot.com`,
    };
  }
  try {
    const res = await apiClient.get<AdminSdkConfig>(`projects/${projectId}/adminSdkConfig`);
    return res.body;
  } catch (err: any) {
    throw new FirebaseError(
      `Failed to get Admin SDK for Firebase project ${projectId}. ` +
        "Please make sure the project exists and your account has permission to access it.",
      { exit: 2, original: err },
    );
  }
}

function setCacheAdminSdkConfig(projectId: string, config: AdminSdkConfig) {
  const allConfigs = configstore.get(_CONFIGSTORE_KEY) || {};
  allConfigs[projectId] = config;
  configstore.set(_CONFIGSTORE_KEY, allConfigs);
}

function getCachedAdminSdkConfig(projectId: string): AdminSdkConfig | undefined {
  const allConfigs = configstore.get(_CONFIGSTORE_KEY) || {};
  return allConfigs[projectId];
}
