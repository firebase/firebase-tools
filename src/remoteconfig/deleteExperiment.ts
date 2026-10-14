import * as clc from "colorette";

import { remoteConfigApiOrigin } from "../api";
import { Client } from "../apiv2";
import { FirebaseError, getErrMsg, getError } from "../error";
import { consoleUrl } from "../utils";

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
): Promise<string> {
  try {
    await apiClient.request<void, void>({
      method: "DELETE",
      path: `projects/${projectId}/namespaces/${namespace}/experiments/${experimentId}`,
      timeout: TIMEOUT,
    });
    return clc.bold(`Successfully deleted experiment ${clc.yellow(experimentId)}`);
  } catch (err: unknown) {
    const error: Error = getError(err);
    if (error.message.includes("is running and cannot be deleted")) {
      const rcConsoleUrl = consoleUrl(projectId, `/config/experiment/results/${experimentId}`);
      throw new FirebaseError(
        `Experiment ${experimentId} is currently running and cannot be deleted. If you want to delete this experiment, stop it at ${rcConsoleUrl}`,
        { original: error },
      );
    }
    throw new FirebaseError(
      `Failed to delete Remote Config experiment with ID ${experimentId} for project ${projectId}. Error: ${getErrMsg(err)}`,
      { original: error },
    );
  }
}
