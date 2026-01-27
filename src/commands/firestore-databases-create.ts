import * as clc from "colorette";

import { Command } from "../command";
import * as fsi from "../firestore/api";
import * as types from "../firestore/api-types";
import { logger } from "../logger";
import { requirePermissions } from "../requirePermissions";
import { Emulators } from "../emulator/types";
import { warnEmulatorNotSupported } from "../emulator/commandUtils";
import { FirestoreOptions } from "../firestore/options";
import { PrettyPrint } from "../firestore/pretty-print";
import { FirebaseError } from "../error";

export const command = new Command("firestore:databases:create <database>")
  .description("create a database in your Firebase project")
  .option(
    "--location <locationId>",
    "region to create database, for example 'nam5'. Run 'firebase firestore:locations' to get a list of eligible locations (required)",
  )
  .option(
    "--edition <edition>",
    "the edition of the database to create, for example 'standard' or 'enterprise'. If not provided, 'standard' is used as a default.",
  )
  .option(
    "--delete-protection <deleteProtectionState>",
    "whether or not to prevent deletion of database, for example 'ENABLED' or 'DISABLED'. Default is 'DISABLED'",
  )
  .option(
    "--point-in-time-recovery <enablement>",
    "whether to enable the PITR feature on this database, for example 'ENABLED' or 'DISABLED'. Default is 'DISABLED'",
  )
  .option(
    "--realtime-updates <enablement",
    "whether realtime updates are enabled for this database. 'ENABLED' or 'DISABLED'. Default is 'ENABLED' for ENTERPRISE edition when firestore-data-access is enabled.",
  )
  .option(
    "--firestore-data-access <enablement>",
    "Whether the Firestore API can be used for this database. 'ENABLED' or 'DISABLED'. Default is 'ENABLED' for ENTERPRISE edition.",
  )
  .option(
    "--mongodb-compatible-data-access <enablement>",
    "Whether the MongoDB compatible API can be used for this database. 'ENABLED' or 'DISABLED'. Default is 'DISABLED' for ENTERPRISE edition",
  )
  // TODO(b/356137854): Remove allowlist only message once feature is public GA.
  .option(
    "-k, --kms-key-name <kmsKeyName>",
    "the resource ID of a Cloud KMS key. If set, the database created will be a " +
      "Customer-managed Encryption Key (CMEK) database encrypted with this key. " +
      "This feature is allowlist only in initial launch",
  )
  .before(requirePermissions, ["datastore.databases.create"])
  .before(warnEmulatorNotSupported, Emulators.FIRESTORE)
  .action(async (database: string, options: FirestoreOptions) => {
    const api = new fsi.FirestoreApi();
    const printer = new PrettyPrint();
    const helpCommandText = "See firebase firestore:databases:create --help for more info.";

    if (!options.location) {
      throw new FirebaseError(`Missing required flag --location. ${helpCommandText}`);
    }
    // Type is always Firestore Native since Firebase does not support Datastore Mode
    const type: types.DatabaseType = types.DatabaseType.FIRESTORE_NATIVE;

    // Figure out the database edition.
    let databaseEdition: types.DatabaseEdition = types.DatabaseEdition.STANDARD;
    if (options.edition) {
      const edition = options.edition.toUpperCase();
      if (
        edition !== types.DatabaseEdition.STANDARD &&
        edition !== types.DatabaseEdition.ENTERPRISE
      ) {
        throw new FirebaseError(`Invalid value for flag --edition. ${helpCommandText}`);
      }
      databaseEdition = edition as types.DatabaseEdition;
    }

    if (
      options.deleteProtection &&
      options.deleteProtection !== types.DatabaseDeleteProtectionStateOption.ENABLED &&
      options.deleteProtection !== types.DatabaseDeleteProtectionStateOption.DISABLED
    ) {
      throw new FirebaseError(`Invalid value for flag --delete-protection. ${helpCommandText}`);
    }
    const deleteProtectionState: types.DatabaseDeleteProtectionState =
      options.deleteProtection === types.DatabaseDeleteProtectionStateOption.ENABLED
        ? types.DatabaseDeleteProtectionState.ENABLED
        : types.DatabaseDeleteProtectionState.DISABLED;

    if (
      options.pointInTimeRecovery &&
      options.pointInTimeRecovery !== types.PointInTimeRecoveryEnablementOption.ENABLED &&
      options.pointInTimeRecovery !== types.PointInTimeRecoveryEnablementOption.DISABLED
    ) {
      throw new FirebaseError(
        `Invalid value for flag --point-in-time-recovery. ${helpCommandText}`,
      );
    }
    const pointInTimeRecoveryEnablement: types.PointInTimeRecoveryEnablement =
      options.pointInTimeRecovery === types.PointInTimeRecoveryEnablementOption.ENABLED
        ? types.PointInTimeRecoveryEnablement.ENABLED
        : types.PointInTimeRecoveryEnablement.DISABLED;

    if (
      options.firestoreDataAccess &&
      options.firestoreDataAccess !== types.DataAccessModeOption.ENABLED &&
      options.firestoreDataAccess !== types.DataAccessModeOption.DISABLED
    ) {
      throw new FirebaseError(`Invalid value for flag --firestore-data-access. ${helpCommandText}`);
    }
    let userFirestoreDataAccess: types.DataAccessMode | undefined;
    if (options.firestoreDataAccess === types.DataAccessModeOption.ENABLED) {
      userFirestoreDataAccess = types.DataAccessMode.ENABLED;
    } else if (options.firestoreDataAccess === types.DataAccessModeOption.DISABLED) {
      userFirestoreDataAccess = types.DataAccessMode.DISABLED;
    }

    if (
      options.mongodbCompatibleDataAccess &&
      options.mongodbCompatibleDataAccess !== types.DataAccessModeOption.ENABLED &&
      options.mongodbCompatibleDataAccess !== types.DataAccessModeOption.DISABLED
    ) {
      throw new FirebaseError(
        `Invalid value for flag --mongodb-compatible-data-access. ${helpCommandText}`,
      );
    }

    let userMongodbDataAccess: types.DataAccessMode | undefined;
    if (options.mongodbCompatibleDataAccess === types.DataAccessModeOption.ENABLED) {
      userMongodbDataAccess = types.DataAccessMode.ENABLED;
    } else if (options.mongodbCompatibleDataAccess === types.DataAccessModeOption.DISABLED) {
      userMongodbDataAccess = types.DataAccessMode.DISABLED;
    }

    let firestoreDataAccessMode: types.DataAccessMode | undefined = userFirestoreDataAccess;
    if (firestoreDataAccessMode == null) {
      firestoreDataAccessMode = getDefaultFirestoreDataAccessMode(
        databaseEdition,
        userMongodbDataAccess,
      );
    }
    let mongodbCompatibleDataAccessMode: types.DataAccessMode | undefined = userMongodbDataAccess;
    if (mongodbCompatibleDataAccessMode == null) {
      mongodbCompatibleDataAccessMode = getDefaultMongodbDataAccessMode(
        databaseEdition,
        userFirestoreDataAccess,
      );
    }

    if (
      options.realtimeUpdates &&
      options.realtimeUpdates !== types.RealtimeUpdatesModeOption.ENABLED &&
      options.realtimeUpdates !== types.RealtimeUpdatesModeOption.DISABLED
    ) {
      throw new FirebaseError(`Invalid value for flag --realtime-updates. ${helpCommandText}`);
    }
    let realtimeUpdatesMode: types.RealtimeUpdatesMode | undefined;
    if (options.realtimeUpdates === types.RealtimeUpdatesModeOption.ENABLED) {
      realtimeUpdatesMode = types.RealtimeUpdatesMode.ENABLED;
    } else if (options.realtimeUpdates === types.RealtimeUpdatesModeOption.DISABLED) {
      realtimeUpdatesMode = types.RealtimeUpdatesMode.DISABLED;
    }
    // If not specified by the user, default realtimeUpdatesMode to ENABLED when
    // firestoreDataAccessMode == ENABLED.
    if (
      realtimeUpdatesMode == null &&
      databaseEdition === types.DatabaseEdition.ENTERPRISE &&
      firestoreDataAccessMode === types.DataAccessMode.ENABLED
    ) {
      realtimeUpdatesMode = types.RealtimeUpdatesMode.ENABLED;
    }

    let cmekConfig: types.CmekConfig | undefined;
    if (options.kmsKeyName) {
      cmekConfig = {
        kmsKeyName: options.kmsKeyName,
      };
    }

    const createDatabaseReq: types.CreateDatabaseReq = {
      project: options.project,
      databaseId: database,
      locationId: options.location,
      type,
      databaseEdition,
      deleteProtectionState,
      pointInTimeRecoveryEnablement,
      realtimeUpdatesMode,
      firestoreDataAccessMode,
      mongodbCompatibleDataAccessMode,
      cmekConfig,
    };

    const databaseResp: types.DatabaseResp = await api.createDatabase(createDatabaseReq);

    logger.info(clc.bold(`Successfully created ${printer.prettyDatabaseString(databaseResp)}`));
    logger.info(
      "Please be sure to configure Firebase rules in your Firebase config file for\n" +
        "the new database. By default, created databases will have closed rules that\n" +
        "block any incoming third-party traffic.",
    );
    logger.info(
      `Your database may be viewed at ${printer.firebaseConsoleDatabaseUrl(options.project, database)}`,
    );

    return databaseResp;
  });

/**
 * Used to determine the default firestoreDataAccessMode if unspecified by the
 * user.
 *
 * If the user specifically enabled mongodbCompatibleDataAccess, then this
 * is DISABLED.
 *
 * If the user left mongodbCompatibleDataAccess unspecified, then this is
 * ENABLED, with the intention of firestoreDataAccess == ENABLED and
 * mongodbCompatibleDataAccess == DISABLED
 */
function getDefaultFirestoreDataAccessMode(
  databaseEdition: types.DatabaseEdition,
  userMongodbDataAccess?: types.DataAccessMode,
): types.DataAccessMode {
  // Data Access Modes are only used for ENTERPRISE.
  if (databaseEdition !== types.DatabaseEdition.ENTERPRISE) {
    return types.DataAccessMode.UNSPECIFIED;
  }

  switch (userMongodbDataAccess) {
    // At the moment, only one DataAccessMode can be enabled, so if the user
    // specified one as enabled, then disable the otherone, otherwise maintain
    // the normal default.
    case types.DataAccessMode.ENABLED:
      return types.DataAccessMode.DISABLED;

    // If mongodb is unspecified, default to firestore ENABLED.
    default:
      return types.DataAccessMode.ENABLED;
  }
}

/**
 * Used to determine the default mongodbCompatibleDataAccessMode if unspecified
 * by the user.
 *
 * If the user specifically enabled firestoreDataAccess, then this is DISABLED.
 *
 * If the user left firestoreDataAccess unspecified, then this is DISABLED, with
 * the intention of firestoreDataAccess == ENABLED and
 * mongodbCompatibleDataAccess == DISABLED
 */
function getDefaultMongodbDataAccessMode(
  databaseEdition: types.DatabaseEdition,
  userFirestoreDataAccess?: types.DataAccessMode,
): types.DataAccessMode {
  // Data Access Modes are only used for ENTERPRISE.
  if (databaseEdition !== types.DatabaseEdition.ENTERPRISE) {
    return types.DataAccessMode.UNSPECIFIED;
  }
  switch (userFirestoreDataAccess) {
    // At the moment, only one DataAccessMode can be enabled, so if the user
    // specified one as enabled, then disable the otherone, otherwise maintain
    // the normal default.
    case types.DataAccessMode.ENABLED:
      return types.DataAccessMode.DISABLED;

    // If firestore data access mode is unspecified, default to mongodb
    // DISABLED.
    default:
      return types.DataAccessMode.DISABLED;
  }
}
