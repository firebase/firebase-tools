"use strict";

var api = require("../../lib/api");

/**
 * List all collection IDs.
 *
 * @param {string} project the Google Cloud project ID.
 * @return {Promise<string[]>} a promise for an array of collection IDs.
 */
var _listCollectionIds = function(project) {
  var url = "/v1beta1/projects/" + project + "/databases/(default)/documents:listCollectionIds";

  return api
    .request("POST", url, {
      auth: true,
      origin: api.firestoreOrigin,
      data: {
        // Maximum 32-bit integer
        pageSize: 2147483647,
      },
    })
    .then(function(res) {
      return res.body.collectionIds || [];
    });
};

/**
 * Delete a single Firestore document.
 *
 * For document format see:
 * https://firebase.google.com/docs/firestore/reference/rest/v1beta1/Document
 *
 * @param {object} doc a Document object to delete.
 * @return {Promise} a promise for the delete operation.
 */
var _deleteDocument = function(doc) {
  return api.request("DELETE", "/v1beta1/" + doc.name, {
    auth: true,
    origin: api.firestoreOrigin,
  });
};

/**
 * Delete an array of Firestore documents.
 *
 * For document format see:
 * https://firebase.google.com/docs/firestore/reference/rest/v1beta1/Document
 *
 * @param {string} project the Google Cloud project ID.
 * @param {object[]} docs an array of Document objects to delete.
 * @return {Promise<number>} a promise for the number of deleted documents.
 */
var _deleteDocuments = function(project, docs) {
  var parent = "projects/" + project + "/databases/(default)/documents";
  var url = parent + ":commit";

  var writes = docs.map(function(doc) {
    return {
      delete: doc.name,
    };
  });

  var body = {
    writes: writes,
  };

  return api
    .request("POST", "/v1beta1/" + url, {
      auth: true,
      data: body,
      origin: api.firestoreOrigin,
    })
    .then(function(res) {
      return res.body.writeResults.length;
    });
};

module.exports = {
  deleteDocument: _deleteDocument,
  deleteDocuments: _deleteDocuments,
  listCollectionIds: _listCollectionIds,
};
