import { remoteConfigApiOrigin } from "../api";
import { Client } from "../apiv2";
import { logger } from "../logger";
import { FirebaseError } from "../error";
import { Rollout } from "./interfaces";

const TIMEOUT = 30000;

// Creates a maximum limit of 50 names for each entry
const MAX_DISPLAY_ITEMS = 50;

const apiClient = new Client({
  urlPrefix: remoteConfigApiOrigin(),
  apiVersion: "v1",
});

/**
 * Function retrieves the most recent template of the current active project
 * @param projectId Input is the project ID string
 * @param namespace Input is namespace of rollout
 * @param rollout_id Input is rollout id of project
 * @return {Promise} Returns a promise of a remote config template using the RemoteConfigTemplate interface
 */
export async function getRollout(
  projectId: string,
  namespace: string,
  rollout_id: string,
): Promise<Rollout> {
  try {
    const params = new URLSearchParams();
    const res = await apiClient.request<null, Rollout>({
      method: "GET",
      path: `/projects/${projectId}/namespace/${namespace}/rollout/${rollout_id}`,
      queryParams: params,
      timeout: TIMEOUT,
    });
    return res.body;
  } catch (err: any) {
    logger.debug(err.message);
    throw new FirebaseError(
      `Failed to get Firebase Rollout template for project ${projectId}. `,
      { original: err },
    );
  }
}
