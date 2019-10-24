import * as api from "./api";
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

/**
 * TODO: deprecate this function in favor of `getAppConfig()` in `/src/management/apps.ts`
 */
export async function fetchWebSetup(options: any): Promise<WebConfig> {
  const projectId = getProjectId(options, false);
  const response = await api.request("GET", `/v1beta1/projects/${projectId}/webApps/-/config`, {
    auth: true,
    origin: api.firebaseApiOrigin,
  });
  return response.body;
}
