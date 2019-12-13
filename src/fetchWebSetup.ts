import * as api from "./api";
import * as getProjectId from "./getProjectId";
import * as configstore from "./configstore";

export interface WebConfig {
  projectId: string;
  appId?: string;
  databaseURL?: string;
  storageBucket?: string;
  locationId?: string;
  apiKey?: string;
  authDomain?: string;
  messagingSenderId?: string;
}

function configKey(projectId: string): string {
  return "webconfig." + projectId;
}

/**
 * Get the last known result of fetchWebSetup from the cache.
 */
export function getCachedWebSetup(options: any) {
  const projectId = getProjectId(options, false);
  return configstore.get(configKey(projectId));
}

/**
 * TODO: deprecate this function in favor of `getAppConfig()` in `/src/management/apps.ts`
 */
export async function fetchWebSetup(options: any): Promise<WebConfig> {
  const projectId = getProjectId(options, false);
  const response = await api.request("GET", `/v1beta1/projects/${projectId}/webApps/-/config`, {
    auth: true,
    origin: api.firebaseApiOrigin,
  });
  const config = response.body;
  configstore.set(configKey(config.projectId), config);
  return config;
}
