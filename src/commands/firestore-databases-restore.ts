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

export const command = new Command("firestore:databases:restore")
  .description("Restore a Firestore database in your Firebase project.")
  .option("-d, --database <databaseID>", "ID of the database to restore into")
  .option("-b, --backup <backup>", "Backup from which to restore")
  .option(
    "-e, --encryption-type <encryptionType",
    "Encryption method of the restored database; one of CUSTOMER_MANAGED_ENCRYPTION, USE_BACKUP_ENCRYPTION, GOOGLE_DEFAULT_ENCRYPTION",
  )
  .option(
    "-k, --kms-key-name <kmsKeyName>",
    "Resource ID of the Cloud KMS key to encrypt the restored database",
  )
  .before(requirePermissions, ["datastore.backups.restoreDatabase"])
  .before(warnEmulatorNotSupported, Emulators.FIRESTORE)
  .action(async (options: FirestoreOptions) => {
    const api = new fsi.FirestoreApi();
    const printer = new PrettyPrint();
    const helpCommandText = "See firebase firestore:databases:restore --help for more info.";

    if (!options.database) {
      throw new FirebaseError(`Missing required flag --database. ${helpCommandText}`);
    }
    const databaseId = options.database;

    if (!options.backup) {
      throw new FirebaseError(`Missing required flag --backup. ${helpCommandText}`);
    }
    const backupName = options.backup;

    let encryptionConfig: types.EncryptionConfig | undefined = undefined;
    switch (options.encryptionType ?? "") {
      case "GOOGLE_DEFAULT_ENCRYPTION":
        encryptionConfig = { useGoogleDefaultEncryption: {} };
        break;
      case "USE_BACKUP_ENCRYPTION":
        encryptionConfig = { useBackupEncryption: {} };
        break;
      case "CUSTOMER_MANAGED_ENCRYPTION":
        if (options.kmsKeyName) {
          encryptionConfig = { kmsKeyName: options.kmsKeyName };
          break;
        } else {
          throw new FirebaseError(
            `If --encryption-type is CUSTOMER_MANAGED_ENCRYPTION, --kms-key-name must be provided. ${helpCommandText}`,
          );
        }
      case "":
        // No encryption config specified
        break;
      default:
        throw new FirebaseError(`Invalid value for flag --encryption-type. ${helpCommandText}`);
    }

    const databaseResp: types.DatabaseResp = await api.restoreDatabase(
      options.project,
      databaseId,
      backupName,
      encryptionConfig,
    );

    if (options.json) {
      logger.info(JSON.stringify(databaseResp, undefined, 2));
    } else {
      logger.info(
        clc.bold(`Successfully initiated restore of ${printer.prettyDatabaseString(databaseResp)}`),
      );
      logger.info(
        "Please be sure to configure Firebase rules in your Firebase config file for\n" +
          "the new database. By default, created databases will have closed rules that\n" +
          "block any incoming third-party traffic.",
      );
      logger.info(
        `Once the restore is complete, your database may be viewed at ${printer.firebaseConsoleDatabaseUrl(options.project, databaseId)}`,
      );
    }

    return databaseResp;
  });
