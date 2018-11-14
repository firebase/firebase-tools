"use strict";

/**
 * Interface for the Firestore Indexes API, so that code can switch
 * between API versions (v1beta1, v1beta2, etc).
 *
 * Type parameters:
 *   T - the API representation of an index.
 */
export interface FirestoreIndexApi<T> {
  list(project: string): Promise<T[]>;
  deploy(project: string, indexes: any[]): Promise<any>;
  validate(index: any): void;
  makeIndexSpec(indexes: T[]): any;
  printIndexes(indexes: T[], pretty: boolean): void;
}
