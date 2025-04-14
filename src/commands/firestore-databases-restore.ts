import * as clc from "colorette";

import { Command } from "../command";
import * as fsi from "../firestore/api";
import * as types from "../firestore/api-types";
import { logger } from "../logger";
import { requirePermissions } from "../requirePermissions";
import { Emulators } from "../emulator/types";
import { warnEmulatorNotSupported } from "../emulator/commandUtils";
import { EncryptionType, FirestoreOptions } from "../firestore/options";
import { PrettyPrint } from "../firestore/pretty-print";
import { FirebaseError } from "../error";

export const command = new Command("firestore:databases:restore")
  .description("restore a Firestore database from a backup")
  .option("-d, --database <databaseID>", "ID of the database to restore into")
  .option("-b, --backup <backup>", "backup from which to restore")
  .option(
    "-e, --encryption-type <encryptionType>",
    `encryption method of the restored database; one of ${EncryptionType.USE_SOURCE_ENCRYPTION} (default), ` +
      `${EncryptionType.CUSTOMER_MANAGED_ENCRYPTION}, ${EncryptionType.GOOGLE_DEFAULT_ENCRYPTION}`,
  )
  // TODO(b/356137854): Remove allowlist only message once feature is public GA.
  .option(
    "-k, --kms-key-name <kmsKeyName>",
    "resource ID of the Cloud KMS key to encrypt the restored database. This " +
      "feature is allowlist only in initial launch",
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
    switch (options.encryptionType) {
      case EncryptionType.GOOGLE_DEFAULT_ENCRYPTION:
        throwIfKmsKeyNameIsSet(options.kmsKeyName);
        encryptionConfig = { googleDefaultEncryption: {} };
        break;
      case EncryptionType.USE_SOURCE_ENCRYPTION:
        throwIfKmsKeyNameIsSet(options.kmsKeyName);
        encryptionConfig = { useSourceEncryption: {} };
        break;
      case EncryptionType.CUSTOMER_MANAGED_ENCRYPTION:
        encryptionConfig = {
          customerManagedEncryption: { kmsKeyName: getKmsKeyOrThrow(options.kmsKeyName) },
        };
        break;
      case undefined:
        throwIfKmsKeyNameIsSet(options.kmsKeyName);
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

    function throwIfKmsKeyNameIsSet(kmsKeyName: string | undefined): void {
      if (kmsKeyName) {
        throw new FirebaseError(
          "--kms-key-name can only be set when specifying an --encryption-type " +
            `of ${EncryptionType.CUSTOMER_MANAGED_ENCRYPTION}.`,
        );
      }
    }

    function getKmsKeyOrThrow(kmsKeyName: string | undefined): string {
      if (kmsKeyName) return kmsKeyName;

      throw new FirebaseError(
        "--kms-key-name must be provided when specifying an --encryption-type " +
          `of ${EncryptionType.CUSTOMER_MANAGED_ENCRYPTION}.`,
      );
    }
  });
