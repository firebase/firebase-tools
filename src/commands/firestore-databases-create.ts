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
    "--delete-protection <deleteProtectionState>",
    "whether or not to prevent deletion of database, for example 'ENABLED' or 'DISABLED'. Default is 'DISABLED'",
  )
  .option(
    "--point-in-time-recovery <enablement>",
    "whether to enable the PITR feature on this database, for example 'ENABLED' or 'DISABLED'. Default is 'DISABLED'",
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
      deleteProtectionState,
      pointInTimeRecoveryEnablement,
      cmekConfig,
    };

    const databaseResp: types.DatabaseResp = await api.createDatabase(createDatabaseReq);

    if (options.json) {
      logger.info(JSON.stringify(databaseResp, undefined, 2));
    } else {
      logger.info(clc.bold(`Successfully created ${printer.prettyDatabaseString(databaseResp)}`));
      logger.info(
        "Please be sure to configure Firebase rules in your Firebase config file for\n" +
          "the new database. By default, created databases will have closed rules that\n" +
          "block any incoming third-party traffic.",
      );
      logger.info(
        `Your database may be viewed at ${printer.firebaseConsoleDatabaseUrl(options.project, database)}`,
      );
    }

    return databaseResp;
  });
