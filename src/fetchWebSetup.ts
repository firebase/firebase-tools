import * as api from "./api";
import * as getProjectId from "./getProjectId";
import { configstore } from "./configstore";

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

const CONFIGSTORE_KEY = "webconfig";

function setCachedWebSetup(projectId: string, config: WebConfig) {
  const allConfigs = configstore.get(CONFIGSTORE_KEY) || {};
  allConfigs[projectId] = config;
  configstore.set(CONFIGSTORE_KEY, allConfigs);
}

/**
 * Get the last known WebConfig from the cache.
 */
export function getCachedWebSetup(options: any): WebConfig | undefined {
  const projectId = getProjectId(options, false);
  const allConfigs = configstore.get(CONFIGSTORE_KEY) || {};
  return allConfigs[projectId];
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
  setCachedWebSetup(config.projectId, config);
  return config;
}
