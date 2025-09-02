import { remoteConfigApiOrigin } from "../api";
import { Client } from "../apiv2";
import { logger } from "../logger";
import { FirebaseError, getErrMsg } from "../error";

const TIMEOUT = 30000;

const apiClient = new Client({
  urlPrefix: remoteConfigApiOrigin(),
  apiVersion: "v1",
});

/**
 * Deletes a Remote Config experiment.
 * @param projectId The ID of the project.
 * @param namespace The namespace under which the experiment is created.
 * @param experimentId The ID of the experiment to retrieve.
 * @return A promise that resolves to the experiment object.
 */
export async function deleteExperiment(
  projectId: string,
  namespace: string,
  experimentId: string,
): Promise<void> {
  try {
    await apiClient.request<void, void>({
      method: "DELETE",
      path: `projects/${projectId}/namespaces/${namespace}/experiments/${experimentId}`,
      timeout: TIMEOUT,
    });
  } catch (err: any) {
    logger.debug(err.message);
    throw new FirebaseError(
      `Failed to delete Remote Config experiment with ID ${experimentId} for project ${projectId}. Error: ${getErrMsg(err)}}`,
      { original: err },
    );
  }
}
