import * as clc from "colorette";
import * as ProgressBar from "progress";

import * as apiv2 from "../apiv2";
import * as firestore from "../gcp/firestore";
import { FirebaseError } from "../error";
import { logger } from "../logger";
import * as utils from "../utils";
import { firestoreOriginOrEmulator } from "../api";

// Datastore allowed numeric IDs where Firestore only allows strings. Numeric IDs are
// exposed to Firestore as __idNUM__, so this is the lowest possible negative numeric
// value expressed in that format.
const MIN_ID = "__id-9223372036854775808__";

// For document format see:
// https://firebase.google.com/docs/firestore/reference/rest/v1/Document
type Document = {
  name: string;
};

export class FirestoreDelete {
  /**
   * Progress bar shared among all instances of the class because when firestore:delete
   * is run on the whole database we issue one delete per root-level collection.
   */
  static progressBar: ProgressBar = new ProgressBar("Deleted :current docs (:rate docs/s)\n", {
    total: Number.MAX_SAFE_INTEGER,
  });

  private apiClient: apiv2.Client;

  public isDocumentPath: boolean;
  public isCollectionPath: boolean;
  public path: string;

  private project: string;
  private recursive: boolean;
  private shallow: boolean;
  private allCollections: boolean;
  private databaseId: string;

  private readBatchSize: number;
  private maxPendingDeletes: number;
  private deleteBatchSize: number;
  private maxQueueSize: number;

  private allDescendants: boolean;
  private root: string;
  private parent: string;

  /**
   * Construct a new Firestore delete operation.
   *
   * @param project the Firestore project ID.
   * @param path path to a document or collection.
   * @param options options object with three optional parameters:
   *                 - options.recursive true if the delete should be recursive.
   *                 - options.shallow true if the delete should be shallow (non-recursive).
   *                 - options.allCollections true if the delete should universally remove all collections and docs.
   */
  constructor(
    project: string,
    path: string | undefined,
    options: {
      recursive?: boolean;
      shallow?: boolean;
      allCollections?: boolean;
      databaseId: string;
    },
  ) {
    this.project = project;
    this.path = path || "";
    this.recursive = Boolean(options.recursive);
    this.shallow = Boolean(options.shallow);
    this.allCollections = Boolean(options.allCollections);
    this.databaseId = options.databaseId;

    // Tunable deletion parameters
    this.readBatchSize = 7500;
    this.maxPendingDeletes = 15;
    this.deleteBatchSize = 250;
    this.maxQueueSize = this.deleteBatchSize * this.maxPendingDeletes * 2;

    // Remove any leading or trailing slashes from the path
    this.path = this.path.replace(/(^\/+|\/+$)/g, "");

    this.allDescendants = this.recursive;

    this.root = `projects/${project}/databases/${this.databaseId}/documents`;

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
      this.validateOptions();
    }

    this.apiClient = new apiv2.Client({
      auth: true,
      apiVersion: "v1",
      urlPrefix: firestoreOriginOrEmulator,
    });
  }

  /**
   * Update the delete batch size and dependent properties.
   */
  private setDeleteBatchSize(size: number): void {
    this.deleteBatchSize = size;
    this.maxQueueSize = this.deleteBatchSize * this.maxPendingDeletes * 2;
  }

  /**
   * Validate all options, throwing an exception for any fatal errors.
   */
  private validateOptions(): void {
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
   * https://firebase.google.com/docs/firestore/reference/rest/v1/StructuredQuery
   *
   * @param allDescendants true if subcollections should be included.
   * @param batchSize maximum number of documents to target (limit).
   * @param startAfter document name to start after (optional).
   * @return a StructuredQuery.
   */
  private collectionDescendantsQuery(
    allDescendants: boolean,
    batchSize: number,
    startAfter?: string,
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
   * https://firebase.google.com/docs/firestore/reference/rest/v1/StructuredQuery
   *
   * @param allDescendants true if subcollections should be included.
   * @param batchSize maximum number of documents to target (limit).
   * @param startAfter document name to start after (optional).
   * @return a StructuredQuery.
   */
  private docDescendantsQuery(allDescendants: boolean, batchSize: number, startAfter?: string) {
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
   * For RPC documentation see:
   * https://firebase.google.com/docs/firestore/reference/rest/v1/projects.databases.documents/runQuery
   *
   * For document format see:
   * https://firebase.google.com/docs/firestore/reference/rest/v1/Document
   *
   * @param allDescendants true if subcollections should be included,
   * @param batchSize the maximum size of the batch.
   * @param startAfter the name of the document to start after (optional).
   * @return a promise for an array of documents.
   */
  private getDescendantBatch(
    allDescendants: boolean,
    batchSize: number,
    startAfter?: string,
  ): Promise<Document[]> {
    const url = this.parent + ":runQuery";
    const body = this.isDocumentPath
      ? this.docDescendantsQuery(allDescendants, batchSize, startAfter)
      : this.collectionDescendantsQuery(allDescendants, batchSize, startAfter);

    return this.apiClient.post<any, Array<{ document?: Document }>>(url, body).then((res) => {
      // Return the 'document' property for each element in the response,
      // where it exists.
      const docs: Document[] = [];
      for (const x of res.body) {
        if (x.document) {
          docs.push(x.document);
        }
      }

      return docs;
    });
  }

  /**
   * Repeatedly query for descendants of a path and delete them in batches
   * until no documents remain.
   *
   * @return a promise for the entire operation.
   */
  private recursiveBatchDelete() {
    let queue: Document[] = [];
    let numDocsDeleted = 0;
    let numPendingDeletes = 0;
    let pagesRemaining = true;
    let pageIncoming = false;
    let lastDocName: string | undefined = undefined;

    const retried: { [name: string]: boolean } = {};
    const failures: string[] = [];
    let fetchFailures = 0;

    const queueLoop = () => {
      // No documents left to delete
      if (queue.length === 0 && numPendingDeletes === 0 && !pagesRemaining) {
        return true;
      }

      // Failure that can't be retried again
      if (failures.length > 0) {
        logger.debug("Found " + failures.length + " failed operations, failing.");
        return true;
      }

      // We have room in the queue for more documents and more exist on the server,
      // so fetch more.
      if (queue.length <= this.maxQueueSize && pagesRemaining && !pageIncoming) {
        pageIncoming = true;

        this.getDescendantBatch(this.allDescendants, this.readBatchSize, lastDocName)
          .then((docs) => {
            fetchFailures = 0;
            pageIncoming = false;

            if (docs.length === 0) {
              pagesRemaining = false;
              return;
            }

            queue = queue.concat(docs);
            lastDocName = docs[docs.length - 1].name;
          })
          .catch((e: unknown) => {
            logger.debug("Failed to fetch page after " + lastDocName, e);
            pageIncoming = false;

            fetchFailures++;
            if (fetchFailures >= 3) {
              failures.push("Failed to fetch documents to delete >= 3 times.");
            }
          });
      }

      // We want to see one batch succeed before we scale up, so this case
      // limits parallelism until first success
      if (numDocsDeleted === 0 && numPendingDeletes >= 1) {
        return false;
      }

      // There are too many outstanding deletes alread
      if (numPendingDeletes > this.maxPendingDeletes) {
        return false;
      }

      // There are no documents to delete right now
      if (queue.length === 0) {
        return false;
      }

      // At this point we want to delete another batch
      const toDelete: Document[] = [];
      const numToDelete = Math.min(this.deleteBatchSize, queue.length);

      for (let i = 0; i < numToDelete; i++) {
        const d = queue.shift();
        if (d) {
          toDelete.push(d);
        }
      }

      numPendingDeletes++;
      firestore
        .deleteDocuments(this.project, toDelete)
        .then((numDeleted) => {
          FirestoreDelete.progressBar.tick(numDeleted);
          numDocsDeleted += numDeleted;
          numPendingDeletes--;
        })
        .catch((e) => {
          // If the transaction is too large, reduce the batch size
          if (
            e.status === 400 &&
            e.message.includes("Transaction too big") &&
            this.deleteBatchSize >= 2
          ) {
            logger.debug("Transaction too big error deleting doc batch", e);

            // Cut batch size way down. If one batch is over 10MB then we need to go much
            // lower in order to keep the total I/O appropriately low.
            //
            // Note that we have multiple batches out at once so we need to account for multiple
            // concurrent failures hitting this branch.
            const newBatchSize = Math.floor(toDelete.length / 10);

            if (newBatchSize < this.deleteBatchSize) {
              utils.logLabeledWarning(
                "firestore",
                `delete transaction too large, reducing batch size from ${this.deleteBatchSize} to ${newBatchSize}`,
              );
              this.setDeleteBatchSize(newBatchSize);
            }

            // Retry this batch
            queue.unshift(...toDelete);
          } else if (e.status >= 500 && e.status < 600) {
            // For server errors, retry if the document has not yet been retried.
            logger.debug("Server error deleting doc batch", e);

            // Retry each doc up to one time
            toDelete.forEach((doc) => {
              if (retried[doc.name]) {
                const message = `Failed to delete doc ${doc.name} multiple times.`;
                logger.debug(message);
                failures.push(message);
              } else {
                retried[doc.name] = true;
                queue.push(doc);
              }
            });
          } else {
            const docIds = toDelete.map((d) => d.name).join(", ");
            const msg = `Fatal error deleting docs ${docIds}`;
            logger.debug(msg, e);
            failures.push(msg);
          }

          numPendingDeletes--;
        });

      return false;
    };

    return new Promise<void>((resolve, reject) => {
      const intervalId = setInterval(() => {
        if (queueLoop()) {
          clearInterval(intervalId);

          if (failures.length === 0) {
            resolve();
          } else {
            const errorDescription = failures.join(", ");
            reject(new FirebaseError(`Deletion failed. Errors: ${errorDescription}.`, { exit: 1 }));
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
   * @return a promise for the entire operation.
   */
  private deletePath(): Promise<any> {
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
      return this.recursiveBatchDelete();
    });
  }

  /**
   * Delete an entire database by finding and deleting each collection.
   *
   * @return a promise for all of the operations combined.
   */
  public deleteDatabase(): Promise<any[]> {
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
            databaseId: this.databaseId,
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
   * @return a promise that returns true if the path has children and false otherwise.
   */
  public checkHasChildren(): Promise<boolean> {
    return this.getDescendantBatch(true, 1).then((docs) => {
      return docs.length > 0;
    });
  }

  /**
   * Run the delete operation.
   */
  public execute() {
    let verifyRecurseSafe;
    if (this.isDocumentPath && !this.recursive && !this.shallow) {
      verifyRecurseSafe = this.checkHasChildren().then((multiple: boolean) => {
        if (multiple) {
          return utils.reject("Document has children, must specify -r or --shallow.", { exit: 1 });
        }
      });
    } else {
      verifyRecurseSafe = Promise.resolve();
    }

    return verifyRecurseSafe.then(() => {
      return this.deletePath();
    });
  }

  public getRoot(): string {
    return this.root;
  }
}
