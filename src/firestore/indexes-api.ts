/**
 * The v1beta1 indexes API used a 'mode' field to represent the indexing mode.
 * This information has now been split into the fields 'arrayConfig' and 'order'.
 * We allow use of 'mode' (for now) so that the move to v1beta2/v1 is not
 * breaking when we can understand the developer's intent.
 */
export enum Mode {
  ASCENDING = "ASCENDING",
  DESCENDING = "DESCENDING",
  ARRAY_CONTAINS = "ARRAY_CONTAINS",
}

export enum QueryScope {
  COLLECTION = "COLLECTION",
  COLLECTION_GROUP = "COLLECTION_GROUP",
}

export enum Order {
  ASCENDING = "ASCENDING",
  DESCENDING = "DESCENDING",
}

export enum ArrayConfig {
  CONTAINS = "CONTAINS",
}

export enum State {
  CREATING = "CREATING",
  READY = "READY",
  NEEDS_REPAIR = "NEEDS_REPAIR",
}

/**
 * An Index as it is represented in the Firestore v1beta2 indexes API.
 */
export interface Index {
  name?: string;
  queryScope: QueryScope;
  fields: IndexField[];
  state?: State;
}

/**
 * A field in an index.
 */
export interface IndexField {
  fieldPath: string;
  order?: Order;
  arrayConfig?: ArrayConfig;
}

/**
 * Represents a single field in the database.
 *
 * If a field has an empty indexConfig, that means all
 * default indexes are exempted.
 */
export interface Field {
  name: string;
  indexConfig: IndexConfig;
}

/**
 * Index configuration overrides for a field.
 */
export interface IndexConfig {
  ancestorField?: string;
  indexes?: Index[];
}
