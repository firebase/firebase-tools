import { remoteConfigApiOrigin } from "../api";
import { Client } from "../apiv2";
import { FirebaseError, getErrMsg, getError } from "../error";

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
): Promise<void> {
  try {
    // FIXED: The generic type for the response is now 'void' as DELETE returns an empty body.
    await apiClient.request<void, void>({
      method: "DELETE",
      // FIXED: Corrected API path to use plural 'namespaces'.
      path: `/projects/${projectId}/namespaces/${namespace}/rollouts/${rolloutId}`,
      timeout: TIMEOUT,
    });
  } catch (err: unknown) {
    const originalError = getError(err);
    if (originalError.message.includes("is running and cannot be deleted")) {
      throw new FirebaseError(
        `Rollout '${rolloutId}' is currently running and cannot be deleted. You must stop the rollout before deleting it.`,
        { original: originalError },
      );
    }
    throw new FirebaseError(
      `Failed to delete Remote Config rollout '${rolloutId}'. Cause: ${getErrMsg(err)}`,
      { original: originalError },
    );
  }
}