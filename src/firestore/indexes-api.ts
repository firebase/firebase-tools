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
  name: string | undefined;
  queryScope: QueryScope;
  fields: IndexField[];
  state: State;
}

/**
 * A field in an index.
 */
export interface IndexField {
  fieldPath: string;
  order: Order | undefined;
  arrayConfig: ArrayConfig | undefined;
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
  ancestorField: string | undefined;
  indexes: Index[];
}
