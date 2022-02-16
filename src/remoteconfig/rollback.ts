import api = require("../api");

const TIMEOUT = 30000;

/**
 * Rolls back to a specific version of the Remote Config template
 * @param projectId Remote Config Template Project Id
 * @param versionNumber Remote Config Template version number to roll back to
 * @return {Promise} Returns a promise of a Remote Config Template using the RemoteConfigTemplate interface
 */
export async function rollbackTemplate(projectId: string, versionNumber?: number): Promise<void> {
  const requestPath = `/v1/projects/${projectId}/remoteConfig:rollback?versionNumber=${versionNumber}`;
  const response = await api.request("POST", requestPath, {
    auth: true,
    origin: api.remoteConfigApiOrigin,
    timeout: TIMEOUT,
  });
  return response.body;
}
