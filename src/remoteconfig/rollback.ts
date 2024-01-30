import { remoteConfigApiOrigin } from "../api";
import { Client } from "../apiv2";
import { RemoteConfigTemplate } from "./interfaces";

const apiClient = new Client({
  urlPrefix: remoteConfigApiOrigin,
  apiVersion: "v1",
});

const TIMEOUT = 30000;

/**
 * Rolls back to a specific version of the Remote Config template
 * @param projectId Remote Config Template Project Id
 * @param versionNumber Remote Config Template version number to roll back to
 * @return Returns a promise of a Remote Config Template using the RemoteConfigTemplate interface
 */
export async function rollbackTemplate(
  projectId: string,
  versionNumber?: number,
): Promise<RemoteConfigTemplate> {
  const params = new URLSearchParams();
  params.set("versionNumber", `${versionNumber}`);
  const res = await apiClient.request<void, RemoteConfigTemplate>({
    method: "POST",
    path: `/projects/${projectId}/remoteConfig:rollback`,
    queryParams: params,
    timeout: TIMEOUT,
  });
  return res.body;
}
