import { FirebaseError } from "../error";

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

export enum ApiScope {
  ANY_API = "ANY_API",
  DATASTORE_MODE_API = "DATASTORE_MODE_API",
  MONGODB_COMPATIBLE_API = "MONGODB_COMPATIBLE_API",
}

export enum Density {
  DENSITY_UNSPECIFIED = "DENSITY_UNSPECIFIED",
  SPARSE_ALL = "SPARSE_ALL",
  SPARSE_ANY = "SPARSE_ANY",
  DENSE = "DENSE",
}

export enum Order {
  ASCENDING = "ASCENDING",
  DESCENDING = "DESCENDING",
}

export enum ArrayConfig {
  CONTAINS = "CONTAINS",
}

export interface VectorConfig {
  dimension: number;
  flat?: {};
}

export enum State {
  CREATING = "CREATING",
  READY = "READY",
  NEEDS_REPAIR = "NEEDS_REPAIR",
}

export enum StateTtl {
  CREATING = "CREATING",
  ACTIVE = "ACTIVE",
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
  apiScope?: ApiScope;
  density?: Density;
  multikey?: boolean;
  unique?: boolean;
}

/**
 * A field in an index.
 */
export interface IndexField {
  fieldPath: string;
  order?: Order;
  arrayConfig?: ArrayConfig;
  vectorConfig?: VectorConfig;
}

/**
 * TTL policy configuration for a field
 */
export interface TtlConfig {
  state: StateTtl;
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
  ttlConfig?: TtlConfig;
}

/**
 * Index configuration overrides for a field.
 */
export interface IndexConfig {
  ancestorField?: string;
  indexes?: Index[];
}

export interface Location {
  name: string;
  labels: any;
  metadata: any;
  locationId: string;
  displayName: string;
}

export enum DatabaseType {
  DATASTORE_MODE = "DATASTORE_MODE",
  FIRESTORE_NATIVE = "FIRESTORE_NATIVE",
}

export enum EnablementOption {
  ENABLED = "ENABLED",
  DISABLED = "DISABLED",
}

export enum DatabaseDeleteProtectionState {
  ENABLED = "DELETE_PROTECTION_ENABLED",
  DISABLED = "DELETE_PROTECTION_DISABLED",
}

export enum PointInTimeRecoveryEnablement {
  ENABLED = "POINT_IN_TIME_RECOVERY_ENABLED",
  DISABLED = "POINT_IN_TIME_RECOVERY_DISABLED",
}

export enum RealtimeUpdatesMode {
  ENABLED = "REALTIME_UPDATES_MODE_ENABLED",
  DISABLED = "REALTIME_UPDATES_MODE_DISABLED",
}

export enum DataAccessMode {
  UNSPECIFIED = "DATA_ACCESS_MODE_UNSPECIFIED",
  ENABLED = "DATA_ACCESS_MODE_ENABLED",
  DISABLED = "DATA_ACCESS_MODE_DISABLED",
}

export enum DatabaseEdition {
  DATABASE_EDITION_UNSPECIFIED = "DATABASE_EDITION_UNSPECIFIED",
  STANDARD = "STANDARD",
  ENTERPRISE = "ENTERPRISE",
}

export interface DatabaseReq {
  locationId?: string;
  type?: DatabaseType;
  databaseEdition?: DatabaseEdition;
  deleteProtectionState?: DatabaseDeleteProtectionState;
  pointInTimeRecoveryEnablement?: PointInTimeRecoveryEnablement;
  realtimeUpdatesMode?: RealtimeUpdatesMode;
  firestoreDataAccessMode?: DataAccessMode;
  mongodbCompatibleDataAccessMode?: DataAccessMode;
  cmekConfig?: CmekConfig;
}

export interface CreateDatabaseReq {
  project: string;
  databaseId: string;
  locationId: string;
  type: DatabaseType;
  databaseEdition?: DatabaseEdition;
  deleteProtectionState: DatabaseDeleteProtectionState;
  pointInTimeRecoveryEnablement: PointInTimeRecoveryEnablement;
  realtimeUpdatesMode?: RealtimeUpdatesMode;
  firestoreDataAccessMode?: DataAccessMode;
  mongodbCompatibleDataAccessMode?: DataAccessMode;
  cmekConfig?: CmekConfig;
}

export interface DatabaseResp {
  name: string;
  uid: string;
  createTime: string;
  updateTime: string;
  locationId: string;
  type: DatabaseType;
  concurrencyMode: string;
  appEngineIntegrationMode: string;
  keyPrefix: string;
  deleteProtectionState: DatabaseDeleteProtectionState;
  pointInTimeRecoveryEnablement: PointInTimeRecoveryEnablement;
  etag: string;
  versionRetentionPeriod: string;
  earliestVersionTime: string;
  realtimeUpdatesMode: RealtimeUpdatesMode;
  firestoreDataAccessMode: DataAccessMode;
  mongodbCompatibleDataAccessMode: DataAccessMode;
  cmekConfig?: CmekConfig;
  databaseEdition?: DatabaseEdition;
}

export interface BulkDeleteDocumentsRequest {
  // Database to operate. Should be of the form:
  // `projects/{project_id}/databases/{database_id}`.
  name: string;
  // IDs of the collection groups to delete. Unspecified means *all* collection groups.
  // Each collection group in this list must be unique.
  collectionIds?: string[];
}

export type BulkDeleteDocumentsResponse = {
  name?: string;
};

export interface Operation {
  name: string;
  done: boolean;
  metadata: Record<string, any>;
  response?: Record<string, any>;
  error?: {
    name: string;
    message: string;
    code: number;
    details?: any[];
  };
}

export interface ListOperationsResponse {
  operations: Operation[];
}

export interface RestoreDatabaseReq {
  databaseId: string;
  backup: string;
  encryptionConfig?: EncryptionConfig;
}

export interface CloneDatabaseReq {
  databaseId: string;
  pitrSnapshot: PITRSnapshot;
  encryptionConfig?: EncryptionConfig;
}

export enum RecurrenceType {
  DAILY = "DAILY",
  WEEKLY = "WEEKLY",
}

export interface CmekConfig {
  kmsKeyName: string;
  activeKeyVersion?: string[];
}

type UseGoogleDefaultEncryption = { googleDefaultEncryption: Record<string, never> };
type UseSourceEncryption = { useSourceEncryption: Record<string, never> };
type UseCustomerManagedEncryption = { customerManagedEncryption: CustomerManagedEncryptionOptions };
type CustomerManagedEncryptionOptions = {
  kmsKeyName: string;
};
export type EncryptionConfig =
  | UseCustomerManagedEncryption
  | UseSourceEncryption
  | UseGoogleDefaultEncryption;

export interface PITRSnapshot {
  database: string;
  snapshotTime: string;
}

/**
 * Validates a flag value that is used with EnablementOption
 */
export function validateEnablementOption(
  optionValue: string | undefined,
  flagName: string,
  helpCommandText: string,
) {
  if (
    optionValue &&
    optionValue !== EnablementOption.ENABLED &&
    optionValue !== EnablementOption.DISABLED
  ) {
    throw new FirebaseError(`Invalid value for flag --${flagName}. ${helpCommandText}`);
  }
}
