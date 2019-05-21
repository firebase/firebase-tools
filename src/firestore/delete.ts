import clc = require("cli-color");
import ProgressBar = require("progress");

import api = require("../api");
import firestore = require("../gcp/firestore");
import FirebaseError = require("../error");
import logger = require("../logger");
import utils = require("../utils");

/**
 * Construct a new Firestore delete operation.
 *
 * @constructor
 * @param {string} project the Firestore project ID.
 * @param {string} path path to a document or collection.
 * @param {boolean} options.recursive true if the delete should be recursive.
 * @param {boolean} options.shallow true if the delete should be shallow (non-recursive).
 * @param {boolean} options.allCollections true if the delete should universally remove all collections and docs.
 */
class FirestoreDelete {
  private project: string;
  private path: string;
  private recursive: boolean;
  private shallow: boolean;
  private allCollections: boolean;
  private isDocumentPath: boolean;
  private isCollectionPath: boolean;
  private parent: string;
  private allDescendants: boolean;
  private progressBar: any;

  constructor(project: string, path: string, options: any) {
    this.project = project;
    this.path = path;
    this.recursive = Boolean(options.recursive);
    this.shallow = Boolean(options.shallow);
    this.allCollections = Boolean(options.allCollections);

    // Remove any leading or trailing slashes from the path
    if (this.path) {
      this.path = this.path.replace(/(^\/+|\/+$)/g, "");
    }

    this.isDocumentPath = this._isDocumentPath(this.path);
    this.isCollectionPath = this._isCollectionPath(this.path);

    this.allDescendants = this.recursive;
    this.parent = "projects/" + project + "/databases/(default)/documents";

    // When --all-collections is passed any other flags or arguments are ignored
    if (!options.allCollections) {
      this._validateOptions();
    }

    this.progressBar = new ProgressBar("Deleted :current docs (:rate docs/s)", {
      total: Number.MAX_SAFE_INTEGER,
    });
  }

  /**
   * Validate all options, throwing an exception for any fatal errors.
   */
  _validateOptions(): void {
    if (this.recursive && this.shallow) {
      throw new FirebaseError("Cannot pass recursive and shallow options together.");
    }

    if (this.isCollectionPath && !this.recursive && !this.shallow) {
      throw new FirebaseError("Must pass recursive or shallow option when deleting a collection.");
    }

    const pieces = this.path.split("/");

    if (pieces.length === 0) {
      throw new FirebaseError("Path length must be greater than zero.");
    }

    const hasEmptySegment = pieces.some((piece) => {
      return piece.length === 0;
    });

    if (hasEmptySegment) {
      throw new FirebaseError("Path must not have any empty segments.");
    }
  }

  /**
   * Determine if a path points to a document.
   *
   * @param {string} path a path to a Firestore document or collection.
   * @return {boolean} true if the path points to a document, false
   * if it points to a collection.
   */
  _isDocumentPath(path: string): boolean {
    if (!path) {
      return false;
    }

    const pieces = path.split("/");
    return pieces.length % 2 === 0;
  }

  /**
   * Determine if a path points to a collection.
   *
   * @param {string} path a path to a Firestore document or collection.
   * @return {boolean} true if the path points to a collection, false
   * if it points to a document.
   */
  _isCollectionPath(path: string): boolean {
    if (!path) {
      return false;
    }

    return !this._isDocumentPath(path);
  }

  /**
   * Construct a StructuredQuery to find descendant documents of a collection.
   *
   * See:
   * https://firebase.google.com/docs/firestore/reference/rest/v1beta1/StructuredQuery
   *
   * @param {boolean} allDescendants true if subcollections should be included.
   * @param {number} batchSize maximum number of documents to target (limit).
   * @param {string=} startAfter document name to start after (optional).
   * @return {object} a StructuredQuery.
   */
  _collectionDescendantsQuery(
    allDescendants: boolean,
    batchSize: number,
    startAfter: string
  ): object {
    const nullChar = String.fromCharCode(0);

    const startAt = this.parent + "/" + this.path + "/" + nullChar;
    const endAt = this.parent + "/" + this.path + nullChar + "/" + nullChar;

    const where = {
      compositeFilter: {
        op: "AND",
        filters: [
          {
            fieldFilter: {
              field: {
                fieldPath: "__name__",
              },
              op: "GREATER_THAN_OR_EQUAL",
              value: {
                referenceValue: startAt,
              },
            },
          },
          {
            fieldFilter: {
              field: {
                fieldPath: "__name__",
              },
              op: "LESS_THAN",
              value: {
                referenceValue: endAt,
              },
            },
          },
        ],
      },
    };

    const query = {
      structuredQuery: {
        where,
        limit: batchSize,
        from: [
          {
            allDescendants,
          },
        ],
        select: {
          fields: [{ fieldPath: "__name__" }],
        },
        orderBy: [{ field: { fieldPath: "__name__" } }],
      },
    };

    if (startAfter) {
      query.structuredQuery.startAt = {
        values: [{ referenceValue: startAfter }],
        before: false,
      };
    }

    return query;
  }

  /**
   * Construct a StructuredQuery to find descendant documents of a document.
   * The document itthis will not be included
   * among the results.
   *
   * See:
   * https://firebase.google.com/docs/firestore/reference/rest/v1beta1/StructuredQuery
   *
   * @param {boolean} allDescendants true if subcollections should be included.
   * @param {number} batchSize maximum number of documents to target (limit).
   * @param {string=} startAfter document name to start after (optional).
   * @return {object} a StructuredQuery.
   */
  _docDescendantsQuery(allDescendants: boolean, batchSize: number, startAfter: string): object {
    const query = {
      structuredQuery: {
        limit: batchSize,
        from: [
          {
            allDescendants,
          },
        ],
        select: {
          fields: [{ fieldPath: "__name__" }],
        },
        orderBy: [{ field: { fieldPath: "__name__" } }],
      },
    };

    if (startAfter) {
      query.structuredQuery.startAt = {
        values: [{ referenceValue: startAfter }],
        before: false,
      };
    }

    return query;
  }

  /**
   * Query for a batch of 'descendants' of a given path.
   *
   * For document format see:
   * https://firebase.google.com/docs/firestore/reference/rest/v1beta1/Document
   *
   * @param {boolean} allDescendants true if subcollections should be included,
   * @param {number} batchSize the maximum size of the batch.
   * @param {string=} startAfter the name of the document to start after (optional).
   * @return {Promise<object[]>} a promise for an array of documents.
   */
  async _getDescendantBatch(
    allDescendants: boolean,
    batchSize: number,
    startAfter: string
  ): Promise<object[]> {
    let url;
    let body;
    if (this.isDocumentPath) {
      url = this.parent + "/" + this.path + ":runQuery";
      body = this._docDescendantsQuery(allDescendants, batchSize, startAfter);
    } else {
      url = this.parent + ":runQuery";
      body = this._collectionDescendantsQuery(allDescendants, batchSize, startAfter);
    }

    return api
      .request("POST", "/v1beta1/" + url, {
        auth: true,
        data: body,
        origin: api.firestoreOrigin,
      })
      .then((res) => {
        // Return the 'document' property for each element in the response,
        // where it exists.
        return res.body
          .filter((x) => {
            return x.document;
          })
          .map((x) => {
            return x.document;
          });
      });
  }

  /**
   * Repeatedly query for descendants of a path and delete them in batches
   * until no documents remain.
   *
   * @return {Promise} a promise for the entire operation.
   */
  async _recursiveBatchDelete(): Promise<any> {
    // Tunable deletion parameters
    const readBatchSize = 7500;
    const deleteBatchSize = 250;
    const maxPendingDeletes = 15;
    const maxQueueSize = deleteBatchSize * maxPendingDeletes * 2;

    // All temporary variables for the deletion queue.
    const queue: any[] = [];
    let numPendingDeletes = 0;
    let pagesRemaining = true;
    let pageIncoming = false;
    let lastDocName: string;

    let failures: any[] = [];
    const retried = {};

    const queueLoop = () => {
      if (queue.length === 0 && numPendingDeletes === 0 && !pagesRemaining) {
        return true;
      }

      if (failures.length > 0) {
        logger.debug("Found " + failures.length + " failed deletes, failing.");
        return true;
      }

      if (queue.length <= maxQueueSize && pagesRemaining && !pageIncoming) {
        pageIncoming = true;

        this._getDescendantBatch(this.allDescendants, readBatchSize, lastDocName)
          .then((docs) => {
            pageIncoming = false;

            if (docs.length === 0) {
              pagesRemaining = false;
              return;
            }

            queue = queue.concat(docs);
            lastDocName = docs[docs.length - 1].name;
          })
          .catch((e) => {
            logger.debug("Failed to fetch page after " + lastDocName, e);
            pageIncoming = false;
          });
      }

      if (numPendingDeletes > maxPendingDeletes) {
        return false;
      }

      if (queue.length === 0) {
        return false;
      }

      const toDelete: any[] = [];
      const numToDelete = Math.min(deleteBatchSize, queue.length);

      for (let i = 0; i < numToDelete; i++) {
        toDelete.push(queue.shift());
      }

      numPendingDeletes++;
      firestore
        .deleteDocuments(this.project, toDelete)
        .then((numDeleted) => {
          FirestoreDelete.progressBar.tick(numDeleted);
          numPendingDeletes--;
        })
        .catch((e) => {
          // For server errors, retry if the document has not yet been retried.
          if (e.status >= 500 && e.status < 600) {
            logger.debug("Server error deleting doc batch", e);

            // Retry each doc up to one time
            toDelete.forEach((doc) => {
              if (retried[doc.name]) {
                logger.debug("Failed to delete doc " + doc.name + " multiple times.");
                failures.push(doc.name);
              } else {
                retried[doc.name] = true;
                queue.push(doc);
              }
            });
          } else {
            logger.debug("Fatal error deleting docs ", e);
            failures = failures.concat(toDelete);
          }

          numPendingDeletes--;
        });

      return false;
    };

    return new Promise((resolve, reject) => {
      const intervalId = setInterval(() => {
        if (queueLoop()) {
          clearInterval(intervalId);

          if (failures.length === 0) {
            resolve();
          } else {
            reject("Failed to delete documents " + failures);
          }
        }
      }, 0);
    });
  }

  /**
   * Delete everything under a given path. If the path represents
   * a document the document is deleted and then all descendants
   * are deleted.
   *
   * @return {Promise} a promise for the entire operation.
   */
  async _deletePath(): Promise<any> {
    let initialDelete;
    if (this.isDocumentPath) {
      const doc = { name: this.parent + "/" + this.path };
      initialDelete = firestore.deleteDocument(doc).catch((err) => {
        logger.debug("deletePath:initialDelete:error", err);
        if (this.allDescendants) {
          // On a recursive delete, we are insensitive to
          // failures of the initial delete
          return Promise.resolve();
        }

        // For a shallow delete, this error is fatal.
        return utils.reject("Unable to delete " + clc.cyan(this.path));
      });
    } else {
      initialDelete = Promise.resolve();
    }

    return initialDelete.then(() => {
      return this._recursiveBatchDelete();
    });
  }

  /**
   * Delete an entire database by finding and deleting each collection.
   *
   * @return {Promise} a promise for all of the operations combined.
   */
  async deleteDatabase(): Promise<any> {
    return firestore
      .listCollectionIds(this.project)
      .catch((err) => {
        logger.debug("deleteDatabase:listCollectionIds:error", err);
        return utils.reject("Unable to list collection IDs");
      })
      .then((collectionIds) => {
        const promises = [];

        logger.info("Deleting the following collections: " + clc.cyan(collectionIds.join(", ")));

        for (const collectionId of collectionIds) {
          const deleteOp = new FirestoreDelete(this.project, collectionId, {
            recursive: true,
          });

          promises.push(deleteOp.execute());
        }

        return Promise.all(promises);
      });
  }

  /**
   * Check if a path has any children. Useful for determining
   * if deleting a path will affect more than one document.
   *
   * @return {Promise<boolean>} a promise that retruns true if the path has
   * children and false otherwise.
   */
  async checkHasChildren(): Promise<boolean> {
    return this._getDescendantBatch(true, 1).then((docs) => {
      return docs.length > 0;
    });
  }

  /**
   * Run the delete operation.
   */
  async execute(): Promise<any> {
    let verifyRecurseSafe;
    if (this.isDocumentPath && !this.recursive && !this.shallow) {
      verifyRecurseSafe = this.checkHasChildren().then((multiple) => {
        if (multiple) {
          return utils.reject("Document has children, must specify -r or --shallow.", { exit: 1 });
        }
      });
    } else {
      verifyRecurseSafe = Promise.resolve();
    }

    return verifyRecurseSafe.then(() => {
      return this._deletePath();
    });
  }
}
