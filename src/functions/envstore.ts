import { firebaseApiOrigin } from "../api";
import { FirebaseError } from "../error";
import { Client } from "../apiv2";

interface EnvStoreEntry {
  name?: string;
  vars: Record<string, string>;
}

const apiClient = new Client({ urlPrefix: firebaseApiOrigin, auth: true });

/**
 *
 * @param projectId
 * @param envStoreId
 * @returns
 */
export async function getStore(projectId: string, envStoreId: string): Promise<EnvStoreEntry> {
  let response;
  try {
    response = await apiClient.get<EnvStoreEntry>(
      `/v1alpha/projects/${projectId}/envStores/${envStoreId}`
    );
  } catch (err) {
    throw new FirebaseError(`Failed to make request: ${err.message}`, { original: err });
  }
  return response.body;
}

/**
 *
 * @param projectId
 * @param envStoreId
 * @param envs
 * @returns
 */
export async function createStore(
  projectId: string,
  envStoreId: string,
  envs: Record<string, string>
): Promise<EnvStoreEntry> {
  const body = {
    name: envStoreId,
    vars: envs,
  };
  let response;
  try {
    response = await apiClient.post<EnvStoreEntry, EnvStoreEntry>(
      `/v1alpha/projects/${projectId}/envStores?env_store_id=${envStoreId}`,
      body
    );
  } catch (err) {
    throw new FirebaseError(`Failed to make request: ${err.message}`, { original: err });
  }
  return response.body;
}

/**
 *
 * @param projectId
 * @param envStoreId
 * @param envs
 * @returns
 */
export async function patchStore(
  projectId: string,
  envStoreId: string,
  envs: Record<string, string>
): Promise<EnvStoreEntry> {
  const body = {
    name: envStoreId,
    vars: envs,
  };
  let response;
  try {
    response = await apiClient.patch<EnvStoreEntry, EnvStoreEntry>(
      `/v1alpha/projects/${projectId}/envStores/${envStoreId}`,
      body
    );
  } catch (err) {
    throw new FirebaseError(`Failed to make request: ${err.message}`, { original: err });
  }
  return response.body;
}

/**
 *
 * @param projectId
 * @param envStoreId
 * @returns
 */
export async function deleteStore(projectId: string, envStoreId: string): Promise<EnvStoreEntry> {
  let response;
  try {
    response = await apiClient.delete<EnvStoreEntry>(
      `/v1alpha/projects/${projectId}/envStores/${envStoreId}`
    );
  } catch (err) {
    throw new FirebaseError(`Failed to make request: ${err.message}`, { original: err });
  }
  return response.body;
}
