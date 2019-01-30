import * as FirebaseError from "../error";

export class FirestorePath {
  path: string;
  parent: string;

  constructor(project: string, path: string) {
    this.path = path;

    // Remove any leading or trailing slashes from the path
    if (this.path) {
      this.path = path.replace(/(^\/+|\/+$)/g, "");
    }

    this.parent = `projects/${project}/databases/(default)/documents`;
  }

  validate(): void {
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

  isDocumentPath(): boolean {
    return this._isDocumentPath(this.path);
  }

  isCollectionPath(): boolean {
    return this._isCollectionPath(this.path);
  }

  getPath(): string {
    return this.path;
  }

  getParent(): string {
    return this.parent;
  }

  /**
   * Get the resource name
   *
   * @return The resource name of the Document. In the format:
   * projects/{projectId}/databases/{databaseId}/documents/{document_path}
   */
  getResourceName(): string {
    return `${this.parent}/${this.path}`;
  }

  /**
   * Determine if a path points to a document.
   *
   * @param path a path to a Firestore document or collection.
   * @return true if the path points to a document, false
   * if it points to a collection.
   */
  private _isDocumentPath(path: string): boolean {
    if (!path) {
      return false;
    }

    const pieces = path.split("/");
    return pieces.length % 2 === 0;
  }

  /**
   * Determine if a path points to a collection.
   *
   * @param path a path to a Firestore document or collection.
   * @return true if the path points to a collection, false
   * if it points to a document.
   */
  private _isCollectionPath(path: string): boolean {
    if (!path) {
      return false;
    }

    return !this._isDocumentPath(path);
  }
}
