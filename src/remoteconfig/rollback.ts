import api = require("../api");
import logger = require("../logger");
import { FirebaseError } from "../error";

const TIMEOUT = 30000;

/**
 * Rolls back to a specific version of the Remote Config template
 * @param projectId Remote Config Template project Id
 * @param versionNumber Remote Config Template version number to roll back to
 * @return {Promise} Returns a promise of a Remote Config template using the RemoteConfigTemplate interface
 */
export async function rollbackTemplate(projectId: string, versionNumber?: number): Promise<void> {
  try {
    let requestPath = `/v1/projects/${projectId}/remoteConfig:rollback?versionNumber=${versionNumber}`;
    const response = await api.request("POST", requestPath, {
      auth: true,
      origin: api.remoteConfigApiOrigin,
      timeout: TIMEOUT,
    });
    return response.body;
  } catch (err) {
    logger.debug(err.message);
    throw new FirebaseError(err.message, {
      exit: 2,
      original: err,
    });
  }
}
