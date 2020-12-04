import * as api from "../api";
import * as logger from "../logger";
import { FirebaseError } from "../error";
import { RemoteConfigTemplate } from "./interfaces";

const TIMEOUT = 30000;

/**
 * Function retrieves the most recent template of the current active project
 * @param projectId Input is the project ID string
 * @param versionNumber Input is the version number string of the project
 * @return {Promise} Returns a promise of a remote config template using the RemoteConfigTemplate interface
 */
export async function getTemplate(
  projectId: string,
  versionNumber?: string
): Promise<RemoteConfigTemplate> {
  try {
    let request = `/v1/projects/${projectId}/remoteConfig`;
    if (versionNumber) {
      request = request + "?versionNumber=" + versionNumber;
    }
    const response = await api.request("GET", request, {
      auth: true,
      origin: api.remoteConfigApiOrigin,
      timeout: TIMEOUT,
    });
    return response.body;
  } catch (err) {
    logger.debug(err.message);
    throw new FirebaseError(
      `Failed to get Firebase Remote Config template for project ${projectId}. `,
      { exit: 2, original: err }
    );
  }
}
