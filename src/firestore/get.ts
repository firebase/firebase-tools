import * as clc from "cli-color";

import * as api from "../api";
import * as firestore from "../gcp/firestore";
import * as FirebaseError from "../error";
import * as logger from "../logger";
import * as utils from "../utils";

export class FirestoreGet {

  path: string;
  parent: string;

  /**
   * Construct a new Firestore get operation.
   *
   * @constructor
   * @param project the Firestore project ID.
   * @param path path to a document or collection.
   */
  constructor(project: string, path: string, options: any) {
    // Remove any leading or trailing slashes from the path
    this.path = path.replace(/(^\/+|\/+$)/g, "");

    //this.isDocumentPath = this._isDocumentPath(this.path);
    //this.isCollectionPath = this._isCollectionPath(this.path);

    this.parent = "projects/" + project + "/databases/(default)/documents";

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
  private _validateOptions() {
    const pieces = this.path.split("/");

    if (pieces.length === 0) {
      throw new FirebaseError("Path length must be greater than zero.");
    }

    const hasEmptySegment = pieces.some(function(piece) {
      return piece.length === 0;
    });

    if (hasEmptySegment) {
      throw new FirebaseError("Path must not have any empty segments.");
    }
  }

  /**
   * Get the firestore document
   *
   * @return {Promise} a promise for the entire operation.
   */
  private _getDocument(): Promise<void> {
    const doc = { name: this.parent + "/" + this.path };
    return firestore.getDocument(doc)
      .then((firestoreDoc: any) => {
        logger.log(firestoreDoc);
        console.log(firestoreDoc);

        //console.log(firestoreDoc.fields.users)
      })
      .catch((err) => {
        console.log(err);

        return utils.reject("Unable to get " + clc.cyan(this.path), null);
      });
  }

}
