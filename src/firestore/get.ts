import * as clc from "cli-color";
import * as api from "../api";
import * as logger from "../logger";
import * as firestore from "../gcp/firestore";
import * as FirebaseError from "../error";
import * as utils from "../utils";
import * as decodeFirestoreValue from "./decodeFirestoreValue";
import { FirestorePath } from "./path";

export class FirestoreGet {
  path: FirestorePath;

  /**
   * Construct a new Firestore get operation.
   *
   * @constructor
   * @param project the Firestore project ID.
   * @param path path to a document.
   */
  constructor(project: string, path: string, options: any) {
    this.path = new FirestorePath(project, path);

    this._validateOptions();
  }

  /**
   * Run the get operation.
   */
  execute(): Promise<void> {
    return this._getDocument();
  }

  /**
   * Validate all options, throwing an exception for any fatal errors.
   */
  private _validateOptions(): void {
    this.path.validate();

    if (this.path.isCollectionPath()) {
      throw new FirebaseError("Path must not be a collection path.");
    }
  }

  /**
   * Get the firestore document
   *
   * @return {Promise} a promise for the entire operation.
   */
  private _getDocument(): Promise<void> {
    const doc = { name: this.path.getResourceName() };
    return firestore
      .getDocument(doc)
      .then((firestoreDoc: any) => {
        const data = decodeFirestoreValue(firestoreDoc);
        process.stdout.write(JSON.stringify(data));
        process.stdout.write("\n");
      })
      .catch((err) => {
        logger.debug(err.message);
        return utils.reject("Unable to get " + clc.cyan(this.path.getPath()), null);
      });
  }
}
