/**
 * NOTE:
 * Changes to this source file will likely affect the Firebase documentation.
 * Please review and update the README as needed and notify firebase-docs@google.com.
 */

import * as API from "./api-types";

/**
 * An entry specifying a compound or other non-default index.
 */
export interface Index {
  collectionGroup: string;
  queryScope: API.QueryScope;
  fields: API.IndexField[];
}

/**
 * An entry specifying field index configuration override.
 */
export interface FieldOverride {
  collectionGroup: string;
  fieldPath: string;
  ttl?: boolean;
  indexes: FieldIndex[];
}

/**
 * Entry specifying a single-field index.
 */
export interface FieldIndex {
  queryScope: API.QueryScope;
  order?: API.Order;
  arrayConfig?: API.ArrayConfig;
}

/**
 * Specification for the JSON file that is used for index deployment,
 */
export interface IndexFile {
  indexes: Index[];
  fieldOverrides?: FieldOverride[];
}
