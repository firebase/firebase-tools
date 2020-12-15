"use strict";

import * as clc from "cli-color";
import * as ProgressBar from "progress";

import * as api from "../api";
import * as firestore from "../gcp/firestore";
import { FirebaseError } from "../error";
import * as logger from "../logger";
import * as utils from "../utils";

// Datastore allowed numeric IDs where Firestore only allows strings. Numeric IDs are
// exposed to Firestore as __idNUM__, so this is the lowest possible negative numeric
// value expressed in that format.
const MIN_ID = "__id-9223372036854775808__";

export class FirestoreDelete {
  /**
   * Progress bar shared by the class.
   */
  static progressBar = new ProgressBar("Deleted :current docs (:rate docs/s)\n", {
    total: Number.MAX_SAFE_INTEGER,
  });

  public isDocumentPath: boolean;
  public isCollectionPath: boolean;
  public path: string;

  private project: string;
  private recursive: boolean;
  private shallow: boolean;
  private allCollections: boolean;

  private allDescendants: boolean;
  private root: string;
  private parent: string;

  /**
   * Construct a new Firestore delete operation.
   *
   * @constructor
   * @param {string} project the Firestore project ID.
   * @param {string | undefined} path path to a document or collection.
   * @param {boolean} options.recursive true if the delete should be recursive.
   * @param {boolean} options.shallow true if the delete should be shallow (non-recursive).
   * @param {boolean} options.allCollections true if the delete should universally remove all collections and docs.
   */
  constructor(
    project: string,
    path: string | undefined,
    options: { recursive?: boolean; shallow?: boolean; allCollections?: boolean }
  ) {
    this.project = project;
    this.path = path || "";
    this.recursive = Boolean(options.recursive);
    this.shallow = Boolean(options.shallow);
    this.allCollections = Boolean(options.allCollections);

    // Remove any leading or trailing slashes from the path
    this.path = this.path.replace(/(^\/+|\/+$)/g, "");

    this.allDescendants = this.recursive;
    this.root = "projects/" + project + "/databases/(default)/documents";

    const segments = this.path.split("/");
    this.isDocumentPath = segments.length % 2 === 0;
    this.isCollectionPath = !this.isDocumentPath;

    // this.parent is the closest ancestor document to the location we're deleting.
    // If we are deleting a document, this.parent is the path of that document.
    // If we are deleting a collection, this.parent is the path of the document
    // containing that collection (or the database root, if it is a root collection).
    this.parent = this.root;
    if (this.isCollectionPath) {
      segments.pop();
    }
    if (segments.length > 0) {
      this.parent += "/" + segments.join("/");
    }

    // When --all-collections is passed any other flags or arguments are ignored
    if (!options.allCollections) {
      this._validateOptions();
    }
  }

  /**
   * Validate all options, throwing an exception for any fatal errors.
   */
  private _validateOptions() {
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
  private _collectionDescendantsQuery(
    allDescendants: boolean,
    batchSize: number,
    startAfter?: string
  ) {
    const nullChar = String.fromCharCode(0);

    const startAt = this.root + "/" + this.path + "/" + MIN_ID;
    const endAt = this.root + "/" + this.path + nullChar + "/" + MIN_ID;

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

    const query: any = {
      structuredQuery: {
        where: where,
        limit: batchSize,
        from: [
          {
            allDescendants: allDescendants,
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
   * The document itself will not be included
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
  private _docDescendantsQuery(allDescendants: boolean, batchSize: number, startAfter?: string) {
    const query: any = {
      structuredQuery: {
        limit: batchSize,
        from: [
          {
            allDescendants: allDescendants,
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
  private _getDescendantBatch(allDescendants: boolean, batchSize: number, startAfter?: string) {
    const url = this.parent + ":runQuery";
    let body;
    if (this.isDocumentPath) {
      body = this._docDescendantsQuery(allDescendants, batchSize, startAfter);
    } else {
      body = this._collectionDescendantsQuery(allDescendants, batchSize, startAfter);
    }

    return api
      .request("POST", "/v1beta1/" + url, {
        auth: true,
        data: body,
        origin: api.firestoreOriginOrEmulator,
      })
      .then((res) => {
        // Return the 'document' property for each element in the response,
        // where it exists.
        return res.body
          .filter((x: any) => {
            return x.document;
          })
          .map((x: any) => {
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
  private _recursiveBatchDelete() {
    // Tunable deletion parameters
    const readBatchSize = 7500;
    const deleteBatchSize = 250;
    const maxPendingDeletes = 15;
    const maxQueueSize = deleteBatchSize * maxPendingDeletes * 2;

    // All temporary variables for the deletion queue.
    let queue: any[] = [];
    let numPendingDeletes = 0;
    let pagesRemaining = true;
    let pageIncoming = false;
    let lastDocName: string | undefined = undefined;

    const retried: { [name: string]: boolean } = {};
    let failures: any[] = [];
    let fetchFailures = 0;

    const queueLoop = () => {
      if (queue.length == 0 && numPendingDeletes == 0 && !pagesRemaining) {
        return true;
      }

      if (failures.length > 0) {
        logger.debug("Found " + failures.length + " failed operations, failing.");
        return true;
      }

      if (queue.length <= maxQueueSize && pagesRemaining && !pageIncoming) {
        pageIncoming = true;

        this._getDescendantBatch(this.allDescendants, readBatchSize, lastDocName)
          .then((docs) => {
            fetchFailures = 0;
            pageIncoming = false;

            if (docs.length == 0) {
              pagesRemaining = false;
              return;
            }

            queue = queue.concat(docs);
            lastDocName = docs[docs.length - 1].name;
          })
          .catch((e) => {
            logger.debug("Failed to fetch page after " + lastDocName, e);
            pageIncoming = false;

            fetchFailures++;
            if (fetchFailures === 3) {
              failures.push(e);
            }
          });
      }

      if (numPendingDeletes > maxPendingDeletes) {
        return false;
      }

      if (queue.length == 0) {
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

          if (failures.length == 0) {
            resolve();
          } else {
            reject(new FirebaseError("Failed to delete documents " + failures, { exit: 1 }));
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
  private _deletePath() {
    let initialDelete;
    if (this.isDocumentPath) {
      const doc = { name: this.root + "/" + this.path };
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
  public deleteDatabase() {
    return firestore
      .listCollectionIds(this.project)
      .catch((err) => {
        logger.debug("deleteDatabase:listCollectionIds:error", err);
        return utils.reject("Unable to list collection IDs");
      })
      .then((collectionIds) => {
        const promises = [];

        logger.info("Deleting the following collections: " + clc.cyan(collectionIds.join(", ")));

        for (let i = 0; i < collectionIds.length; i++) {
          const collectionId = collectionIds[i];
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
  public checkHasChildren() {
    return this._getDescendantBatch(true, 1).then((docs) => {
      return docs.length > 0;
    });
  }

  /**
   * Run the delete operation.
   */
  public execute() {
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
