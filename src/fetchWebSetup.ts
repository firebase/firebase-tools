import { Client } from "./apiv2";
import { configstore } from "./configstore";
import { firebaseApiOrigin } from "./api";
import * as getProjectId from "./getProjectId";

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

const apiClient = new Client({ urlPrefix: firebaseApiOrigin, auth: true, apiVersion: "v1beta1" });

const CONFIGSTORE_KEY = "webconfig";

function setCachedWebSetup(projectId: string, config: WebConfig): void {
  const allConfigs = configstore.get(CONFIGSTORE_KEY) || {};
  allConfigs[projectId] = config;
  configstore.set(CONFIGSTORE_KEY, allConfigs);
}

/**
 * Get the last known WebConfig from the cache.
 * @param options CLI options.
 * @return web app configuration, or undefined.
 */
export function getCachedWebSetup(options: any): WebConfig | undefined {
  const projectId = getProjectId(options, false);
  const allConfigs = configstore.get(CONFIGSTORE_KEY) || {};
  return allConfigs[projectId];
}

/**
 * TODO: deprecate this function in favor of `getAppConfig()` in `/src/management/apps.ts`
 * @param options CLI options.
 * @return web app configuration.
 */
export async function fetchWebSetup(options: any): Promise<WebConfig> {
  const projectId = getProjectId(options, false);
  const res = await apiClient.get<WebConfig>(`/projects/${projectId}/webApps/-/config`);
  const config = res.body;
  setCachedWebSetup(config.projectId, config);
  return config;
}
