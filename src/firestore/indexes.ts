"use strict";

/**
 * Interface for the Firestore Indexes API, so that code can switch
 * between API versions (v1beta1, v1beta2, etc).
 */
export interface FirestoreIndexApi<T> {
  makeIndexSpec(indexes: T[]): any;
  printIndexes(indexes: T[], pretty: boolean): void;
  list(project: string): Promise<T[]>;
}
