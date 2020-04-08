import api = require("../api");

const _API_ROOT = "/v1beta1/";

/**
 * List all collection IDs.
 *
 * @param {string} project the Google Cloud project ID.
 * @return {Promise<string[]>} a promise for an array of collection IDs.
 */
export async function listCollectionIds(project: string): Promise<string[]> {
  const url =
    _API_ROOT + "projects/" + project + "/databases/(default)/documents:listCollectionIds";
  return api
    .request("POST", url, {
      auth: true,
      origin: api.firestoreOriginOrEmulator,
      data: {
        // Maximum 32-bit integer
        pageSize: 2147483647,
      },
    })
    .then((res) => {
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
  return api.request("DELETE", _API_ROOT + doc.name, {
    auth: true,
    origin: api.firestoreOriginOrEmulator,
  });
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
  const url = _API_ROOT + "projects/" + project + "/databases/(default)/documents:commit";

  const writes = docs.map((doc) => {
    return { delete: doc.name };
  });

  const body = { writes };

  try {
    const res = await api.request("POST", url, {
      auth: true,
      data: body,
      origin: api.firestoreOriginOrEmulator,
    });
    return res.body.writeResults.length;
  } catch (err) {
    if (
      err.status === 400 &&
      err.message.indexOf("Transaction too big") !== -1 &&
      docs.length > 2
    ) {
      // If the batch is too large, we can get errors. Recursively split the
      // batch into pieces and process them individually. This can lead to
      // partial deletes if one of them succeeeds and the other fails.
      const a = await deleteDocuments(project, docs.slice(0, docs.length / 2));
      const b = await deleteDocuments(project, docs.slice(docs.length / 2));
      return a + b;
    }
    throw err;
  }
}
