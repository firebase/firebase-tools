import * as API from "./indexes-api";

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
export interface Field {
  collectionGroup: string;
  fieldPath: string;
  indexes: FieldIndex[];
}

/**
 * Entry specifying a single-field index.
 */
export interface FieldIndex {
  order: API.Order | undefined;
  arrayConfig: API.ArrayConfig | undefined;
  queryScope: API.QueryScope | undefined;
}

/**
 * Specification for the JSON file that is used for index deployment,
 */
export interface IndexFile {
  indexes: Spec.Index[];
  fieldOverrides: Spec.Field[] | undefined;
}
