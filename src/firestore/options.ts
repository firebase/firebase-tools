import { Options } from "../options";
import { DayOfWeek } from "../gcp/firestore";
import * as types from "../firestore/api-types";

/**
 * The set of fields that the Firestore commands need from Options.
 * It is preferable that all codebases use this technique so that they keep
 * strong typing in their codebase but limit the codebase to have less to mock.
 */
export interface FirestoreOptions extends Options {
  project: string;
  database?: string;
  nonInteractive: boolean;
  allCollections?: boolean;
  shallow?: boolean;
  recursive?: boolean;
  location?: string;
  type?: types.DatabaseType;
  deleteProtection?: types.DatabaseDeleteProtectionStateOption;
  pointInTimeRecoveryEnablement?: types.PointInTimeRecoveryEnablementOption;

  // backup schedules
  backupSchedule?: string;
  retention?: `${number}${"h" | "d" | "m" | "w"}`;
  recurrence?: types.RecurrenceType;
  dayOfWeek?: DayOfWeek;

  // backups
  backup?: string;

  // CMEK
  encryptionType?: EncryptionType;
  kmsKeyName?: string;
}

export enum EncryptionType {
  CUSTOMER_MANAGED_ENCRYPTION = "CUSTOMER_MANAGED_ENCRYPTION",
  USE_SOURCE_ENCRYPTION = "USE_SOURCE_ENCRYPTION",
  GOOGLE_DEFAULT_ENCRYPTION = "GOOGLE_DEFAULT_ENCRYPTION",
}
