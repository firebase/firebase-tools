import { firestoreOrigin } from "../api";
import { Client } from "../apiv2";
import { logger } from "../logger";

const apiClient = new Client({
  auth: true,
  apiVersion: "v1",
  urlPrefix: firestoreOrigin,
});

export interface Database {
  name: string;
  uid: string;
  createTime: string;
  updateTime: string;
  locationId: string;
  type: "DATABASE_TYPE_UNSPECIFIED" | "FIRESTORE_NATIVE" | "DATASTORE_MODE";
  concurrencyMode:
    | "CONCURRENCY_MODE_UNSPECIFIED"
    | "OPTIMISTIC"
    | "PESSIMISTIC"
    | "OPTIMISTIC_WITH_ENTITY_GROUPS";
  appEngineIntegrationMode: "APP_ENGINE_INTEGRATION_MODE_UNSPECIFIED" | "ENABLED" | "DISABLED";
  keyPrefix: string;
  etag: string;
}

/**
 * Get a firebase database instance.
 *
 * @param {string} project the Google Cloud project
 * @param {string} database the Firestore database name
 */
export async function getDatabase(project: string, database: string): Promise<Database> {
  const url = `projects/${project}/databases/${database}`;
  try {
    const resp = await apiClient.get<Database>(url);
    return resp.body;
  } catch (err: unknown) {
    logger.info(
      `There was an error retrieving the Firestore database. Currently, the database id is set to ${database}, make sure it exists.`,
    );
    throw err;
  }
}

/**
 * List all collection IDs.
 *
 * @param {string} project the Google Cloud project ID.
 * @return {Promise<string[]>} a promise for an array of collection IDs.
 */
export function listCollectionIds(project: string): Promise<string[]> {
  const url = "projects/" + project + "/databases/(default)/documents:listCollectionIds";
  const data = {
    // Maximum 32-bit integer
    pageSize: 2147483647,
  };

  return apiClient.post<any, { collectionIds?: string[] }>(url, data).then((res) => {
    return res.body.collectionIds || [];
  });
}

/**
 * Delete a single Firestore document.
 *
 * For document format see:
 * https://firebase.google.com/docs/firestore/reference/rest/v1beta1/Document
 *
 * @param {object} doc a Document object to delete.
 * @return {Promise} a promise for the delete operation.
 */
export async function deleteDocument(doc: any): Promise<any> {
  return apiClient.delete(doc.name);
}

/**
 * Non-atomically delete an array of Firestore documents.
 *
 * For document format see:
 * https://firebase.google.com/docs/firestore/reference/rest/v1beta1/Document
 *
 * @param {string} project the Google Cloud project ID.
 * @param {object[]} docs an array of Document objects to delete.
 * @return {Promise<number>} a promise for the number of deleted documents.
 */
export async function deleteDocuments(project: string, docs: any[]): Promise<number> {
  const url = "projects/" + project + "/databases/(default)/documents:commit";

  const writes = docs.map((doc) => {
    return { delete: doc.name };
  });
  const data = { writes };

  const res = await apiClient.post<any, { writeResults: any[] }>(url, data);
  return res.body.writeResults.length;
}
