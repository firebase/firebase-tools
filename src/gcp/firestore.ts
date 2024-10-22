import { firestoreOrigin, firestoreOriginOrEmulator } from "../api";
import { Client } from "../apiv2";
import { logger } from "../logger";
import { Duration, assertOneOf, durationFromSeconds } from "./proto";
import { FirebaseError } from "../error";

const prodOnlyClient = new Client({
  auth: true,
  apiVersion: "v1",
  urlPrefix: firestoreOrigin(),
});

const emuOrProdClient = new Client({
  auth: true,
  apiVersion: "v1",
  urlPrefix: firestoreOriginOrEmulator(),
});

export interface Database {
  name: string;
  uid: string;
  createTime: string;
  updateTime: string;
  locationId: string;
  type: "DATABASE_TYPE_UNSPECIFIED" | "FIRESTORE_NATIVE" | "DATASTORE_MODE";
  concurrencyMode:
    | "CONCURRENCY_MODE_UNSPECIFIED"
    | "OPTIMISTIC"
    | "PESSIMISTIC"
    | "OPTIMISTIC_WITH_ENTITY_GROUPS";
  appEngineIntegrationMode: "APP_ENGINE_INTEGRATION_MODE_UNSPECIFIED" | "ENABLED" | "DISABLED";
  keyPrefix: string;
  etag: string;
}

export enum DayOfWeek {
  MONDAY = "MONDAY",
  TUEDAY = "TUESDAY",
  WEDNESDAY = "WEDNESDAY",
  THURSDAY = "THURSDAY",
  FRIDAY = "FRIDAY",
  SATURDAY = "SATURDAY",
  SUNDAY = "SUNDAY",
}
// No DailyRecurrence type as it would just be an empty interface
export interface WeeklyRecurrence {
  day: DayOfWeek;
}

export interface BackupSchedule {
  name?: string;
  createTime?: string;
  updateTime?: string;
  retention: Duration;

  // oneof recurrence
  dailyRecurrence?: Record<string, never>; // Typescript for "empty object"
  weeklyRecurrence?: WeeklyRecurrence;
  // end oneof recurrence
}

export interface Backup {
  name?: string;
  database?: string;
  databaseUid?: string;
  snapshotTime?: string;
  expireTime?: string;
  stats?: string;
  state?: "CREATING" | "READY" | "NOT_AVAILABLE";
}

export interface ListBackupsResponse {
  backups?: Backup[];
  unreachable?: string[];
}

/**
 * Get a firebase database instance.
 * @param {string} project the Google Cloud project
 * @param {string} database the Firestore database name
 */
export async function getDatabase(
  project: string,
  database: string,
  allowEmulator: boolean = false,
): Promise<Database> {
  const apiClient = allowEmulator ? emuOrProdClient : prodOnlyClient;
  const url = `projects/${project}/databases/${database}`;
  try {
    const resp = await apiClient.get<Database>(url);
    return resp.body;
  } catch (err: unknown) {
    logger.info(
      `There was an error retrieving the Firestore database. Currently, the database id is set to ${database}, make sure it exists.`,
    );
    throw err;
  }
}

/**
 * List all collection IDs.
 * @param {string} project the Google Cloud project ID.
 * @return {Promise<string[]>} a promise for an array of collection IDs.
 */
export function listCollectionIds(
  project: string,
  allowEmulator: boolean = false,
): Promise<string[]> {
  const apiClient = allowEmulator ? emuOrProdClient : prodOnlyClient;
  const url = "projects/" + project + "/databases/(default)/documents:listCollectionIds";
  const data = {
    // Maximum 32-bit integer
    pageSize: 2147483647,
  };

  return apiClient.post<any, { collectionIds?: string[] }>(url, data).then((res) => {
    return res.body.collectionIds || [];
  });
}

/**
 * Delete a single Firestore document.
 *
 * For document format see:
 * https://firebase.google.com/docs/firestore/reference/rest/v1beta1/Document
 * @param {object} doc a Document object to delete.
 * @return {Promise} a promise for the delete operation.
 */
export async function deleteDocument(doc: any, allowEmulator: boolean = false): Promise<any> {
  const apiClient = allowEmulator ? emuOrProdClient : prodOnlyClient;
  return apiClient.delete(doc.name);
}

/**
 * Non-atomically delete an array of Firestore documents.
 *
 * For document format see:
 * https://firebase.google.com/docs/firestore/reference/rest/v1beta1/Document
 * @param {string} project the Google Cloud project ID.
 * @param {object[]} docs an array of Document objects to delete.
 * @return {Promise<number>} a promise for the number of deleted documents.
 */
export async function deleteDocuments(
  project: string,
  docs: any[],
  allowEmulator: boolean = false,
): Promise<number> {
  const apiClient = allowEmulator ? emuOrProdClient : prodOnlyClient;
  const url = "projects/" + project + "/databases/(default)/documents:commit";

  const writes = docs.map((doc) => {
    return { delete: doc.name };
  });
  const data = { writes };

  const res = await apiClient.post<any, { writeResults: any[] }>(url, data, {
    retries: 10,
    retryCodes: [429, 409, 503],
    retryMaxTimeout: 20 * 1000,
  });
  return res.body.writeResults.length;
}

/**
 * Create a backup schedule for the given Firestore database.
 * @param {string} project the Google Cloud project ID.
 * @param {string} databaseId the Firestore database ID.
 * @param {number} retention The retention of backups, in seconds.
 * @param {Record<string, never>?} dailyRecurrence Optional daily recurrence.
 * @param {WeeklyRecurrence?} weeklyRecurrence Optional weekly recurrence.
 */
export async function createBackupSchedule(
  project: string,
  databaseId: string,
  retention: number,
  dailyRecurrence?: Record<string, never>,
  weeklyRecurrence?: WeeklyRecurrence,
): Promise<BackupSchedule> {
  const url = `projects/${project}/databases/${databaseId}/backupSchedules`;
  const data = {
    retention: durationFromSeconds(retention),
    dailyRecurrence,
    weeklyRecurrence,
  };
  assertOneOf("BackupSchedule", data, "recurrence", "dailyRecurrence", "weeklyRecurrence");
  const res = await prodOnlyClient.post<BackupSchedule, BackupSchedule>(url, data);
  return res.body;
}

/**
 * Update a backup schedule for the given Firestore database.
 * Only retention updates are currently supported.
 * @param {string} backupScheduleName The backup schedule to update
 * @param {number} retention The retention of backups, in seconds.
 */
export async function updateBackupSchedule(
  backupScheduleName: string,
  retention: number,
): Promise<BackupSchedule> {
  const data = {
    retention: durationFromSeconds(retention),
  };
  const res = await prodOnlyClient.patch<BackupSchedule, BackupSchedule>(backupScheduleName, data);
  return res.body;
}

/**
 * Delete a backup for the given Firestore database.
 * @param {string} backupName Name of the backup
 */
export async function deleteBackup(backupName: string): Promise<void> {
  await prodOnlyClient.delete(backupName);
}

/**
 * Delete a backup schedule for the given Firestore database.
 * @param {string} backupScheduleName Name of the backup schedule
 */
export async function deleteBackupSchedule(backupScheduleName: string): Promise<void> {
  await prodOnlyClient.delete(backupScheduleName);
}

/**
 * List all backups that exist at a given location.
 * @param {string} project the Firebase project id.
 * @param {string} location the Firestore location id.
 */
export async function listBackups(project: string, location: string): Promise<ListBackupsResponse> {
  const url = `/projects/${project}/locations/${location}/backups`;
  const res = await prodOnlyClient.get<ListBackupsResponse>(url);
  return res.body;
}

/**
 * Get a backup
 * @param {string} backupName the backup name
 */
export async function getBackup(backupName: string): Promise<Backup> {
  const res = await prodOnlyClient.get<Backup>(backupName);
  const backup = res.body;
  if (!backup) {
    throw new FirebaseError("Not found");
  }

  return backup;
}

/**
 * List all backup schedules that exist under a given database.
 * @param {string} project the Firebase project id.
 * @param {string} database the Firestore database id.
 */
export async function listBackupSchedules(
  project: string,
  database: string,
): Promise<BackupSchedule[]> {
  const url = `/projects/${project}/databases/${database}/backupSchedules`;
  const res = await prodOnlyClient.get<{ backupSchedules?: BackupSchedule[] }>(url);
  const backupSchedules = res.body.backupSchedules;
  if (!backupSchedules) {
    return [];
  }

  return backupSchedules;
}

/**
 * Get a backup schedule
 * @param {string} backupScheduleName Name of the backup schedule
 */
export async function getBackupSchedule(backupScheduleName: string): Promise<BackupSchedule> {
  const res = await prodOnlyClient.get<BackupSchedule>(backupScheduleName);
  const backupSchedule = res.body;
  if (!backupSchedule) {
    throw new FirebaseError("Not found");
  }

  return backupSchedule;
}
