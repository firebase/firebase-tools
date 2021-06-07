import { firebaseApiOrigin } from "../api";
import { FirebaseError } from "../error";
import { Client } from "../apiv2";

interface EnvStoreEntry {
  name?: string;
  vars: Record<string, string>;
}

const apiClient = new Client({ urlPrefix: firebaseApiOrigin, auth: true });

/**
 * Get envstore entry from the EnvStore Service.
 *
 * @return {EnvStoreEntry} EnvStore entry for given envstore id.
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
 * Create envstore entry in the EnvStore Service with the given environment variables.
 *
 * @return {EnvStoreEntry} EnvStore entry for given envstore id.
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
 * Patch envstore entry with given environment variables.
 *
 * @return {EnvStoreEntry} Patched EnvStore entry.
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
 * Delete envstore entry.
 *
 * @return {EnvStoreEntry} Empty envstore entry.
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
