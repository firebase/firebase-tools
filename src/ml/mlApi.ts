import * as api from "../api";
import { FirebaseModel } from "../ml/models";

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

/**
 * Get a Firebase model.
 * @param projectId The project where the model exists
 * @param modelId The id of the model to get
 * @return The model
 */
export async function getModel(projectId: string, modelId: string): Promise<FirebaseModel> {
  const res = await api.request("GET", `/${VERSION}/projects/${projectId}/models/${modelId}`, {
    auth: true,
    origin: api.mlOrigin,
  });
  return res.response.body;
}
