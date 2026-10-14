import { remoteConfigApiOrigin } from "../api";
import { Client } from "../apiv2";
import { FirebaseError, getErrMsg, getError } from "../error";
import { consoleUrl } from "../utils";
import * as clc from "colorette";

const TIMEOUT = 30000;

const apiClient = new Client({
  urlPrefix: remoteConfigApiOrigin(),
  apiVersion: "v1",
});

/**
 * Deletes a Remote Config rollout.
 * @param projectId The project ID.
 * @param namespace The namespace of the rollout.
 * @param rolloutId The ID of the rollout to delete.
 * @return A promise that resolves when the deletion is complete.
 */
export async function deleteRollout(
  projectId: string,
  namespace: string,
  rolloutId: string,
): Promise<string> {
  try {
    await apiClient.request<void, void>({
      method: "DELETE",
      path: `/projects/${projectId}/namespaces/${namespace}/rollouts/${rolloutId}`,
      timeout: TIMEOUT,
    });
    return clc.bold(`Successfully deleted rollout ${clc.yellow(rolloutId)}`);
  } catch (err: unknown) {
    const originalError = getError(err);
    const errorMessage = getErrMsg(err);

    if (errorMessage.includes("is running and cannot be deleted")) {
      const rcConsoleUrl = consoleUrl(projectId, `/config/env/firebase/rollout/${rolloutId}`);
      throw new FirebaseError(
        `Rollout '${rolloutId}' is currently running and cannot be deleted. If you want to delete this rollout, stop it at ${rcConsoleUrl}`,
        { original: originalError },
      );
    }
    throw new FirebaseError(
      `Failed to delete Remote Config rollout with ID ${rolloutId} for project ${projectId}. Error: ${errorMessage}`,
      { original: originalError },
    );
  }
}
