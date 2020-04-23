import * as api from "../api";

const VERSION = "v1beta2";

/**
 * Delete a Firebase model.
 *
 * @param projectId the project where the model exists
 * @param modelId the id of the model to delete
 */
export async function deleteModel(projectId: string, modelId: string): Promise<void> {
  await api.request("DELETE", `/${VERSION}/projects/${projectId}/models/${modelId}`, {
    auth: true,
    origin: api.mlOrigin,
  });
}
