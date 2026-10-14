import * as clc from "colorette";

import { Command } from "../command";
import * as fsi from "../firestore/api";
import * as types from "../firestore/api-types";
import { getCurrentMinuteAsIsoString, parseDatabaseName } from "../firestore/util";
import { logger } from "../logger";
import { requirePermissions } from "../requirePermissions";
import { Emulators } from "../emulator/types";
import { warnEmulatorNotSupported } from "../emulator/commandUtils";
import { EncryptionType, FirestoreOptions } from "../firestore/options";
import { PrettyPrint } from "../firestore/pretty-print";
import { FirebaseError } from "../error";

export const command = new Command("firestore:databases:clone <sourceDatabase> <targetDatabase>")
  .description("clone one Firestore database to another")
  .option(
    "-e, --encryption-type <encryptionType>",
    `encryption method of the cloned database; one of ${EncryptionType.USE_SOURCE_ENCRYPTION} (default), ` +
      `${EncryptionType.CUSTOMER_MANAGED_ENCRYPTION}, ${EncryptionType.GOOGLE_DEFAULT_ENCRYPTION}`,
  )
  // TODO(b/356137854): Remove allowlist only message once feature is public GA.
  .option(
    "-k, --kms-key-name <kmsKeyName>",
    "resource ID of the Cloud KMS key to encrypt the cloned database. This " +
      "feature is allowlist only in initial launch",
  )
  .option(
    "-s, --snapshot-time <snapshotTime>",
    "snapshot time of the source database to use, in ISO 8601 format. Can be any minutely snapshot after the database's earliest version time. If unspecified, takes the most recent available snapshot",
  )
  .before(requirePermissions, ["datastore.databases.clone"])
  .before(warnEmulatorNotSupported, Emulators.FIRESTORE)
  .action(async (sourceDatabase: string, targetDatabase: string, options: FirestoreOptions) => {
    const api = new fsi.FirestoreApi();
    const printer = new PrettyPrint();
    const helpCommandText = "See firebase firestore:databases:clone --help for more info.";

    if (options.database) {
      throw new FirebaseError(
        `--database is not a supported flag for 'firestoree:databases:clone'. ${helpCommandText}`,
      );
    }

    let snapshotTime: string;
    if (options.snapshotTime) {
      snapshotTime = options.snapshotTime;
    } else {
      snapshotTime = getCurrentMinuteAsIsoString();
    }

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

    // projects must be the same
    const targetDatabaseName = parseDatabaseName(targetDatabase);
    const parentProject = targetDatabaseName.projectId;
    const targetDatabaseId = targetDatabaseName.databaseId;
    const sourceProject = parseDatabaseName(sourceDatabase).projectId;
    if (parentProject !== sourceProject) {
      throw new FirebaseError(`Cloning across projects is not supported.`);
    }
    const lro: types.Operation = await api.cloneDatabase(
      sourceProject,
      {
        database: sourceDatabase,
        snapshotTime,
      },
      targetDatabaseId,
      encryptionConfig,
    );

    if (lro.error) {
      logger.error(
        clc.bold(
          `Clone to ${printer.prettyDatabaseString(targetDatabase)} failed. See below for details.`,
        ),
      );
      printer.prettyPrintOperation(lro);
    } else {
      logger.info(
        clc.bold(`Successfully initiated clone to ${printer.prettyDatabaseString(targetDatabase)}`),
      );
      logger.info(
        "Please be sure to configure Firebase rules in your Firebase config file for\n" +
          "the new database. By default, created databases will have closed rules that\n" +
          "block any incoming third-party traffic.",
      );
      logger.info();
      logger.info(`You can monitor the progress of this clone by executing this command:`);
      logger.info();
      logger.info(
        `firebase firestore:operations:describe --database="${targetDatabaseId}" ${lro.name}`,
      );
      logger.info();
      logger.info(
        `Once the clone is complete, your database may be viewed at ${printer.firebaseConsoleDatabaseUrl(options.project, targetDatabaseId)}`,
      );
    }

    return lro;

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
