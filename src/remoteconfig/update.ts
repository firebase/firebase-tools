import * as api from "../api";
import * as logger from "../logger";
import { FirebaseError } from "../error";
import { RemoteConfigTemplate } from "./interfaces";

const TIMEOUT = 30000;

/**
 * Function updates remote template and retrieves the updated template of the current active project
 * @param projectId Input is the project ID string
 * @param payLoad Input is the template file content
 * @param validateOnly Input is to only validate config against server
 * @return {Promise} Returns a promise of a remote config template using the RemoteConfigTemplate interface
 */
export async function updateTemplate(
  projectId: string,
  payLoad: string,
  validateOnly: boolean
): Promise<RemoteConfigTemplate> {
  try {
    const request = `/v1/projects/${projectId}/remoteConfig?validateOnly=${validateOnly}`;
    const response = await api.request("PUT", request, {
      auth: true,
      headers: {
        "Content-Type": "application/json",
        "If-Match": "*",
      },
      origin: api.remoteConfigApiOrigin,
      timeout: TIMEOUT,
      data: JSON.parse(payLoad),
    });
    return response.body;
  } catch (err) {
    logger.debug(err.message);
    throw new FirebaseError(
      `Failed to update Firebase Remote Config template for project ${projectId}. `,
      { exit: 2, original: err }
    );
  }
}
