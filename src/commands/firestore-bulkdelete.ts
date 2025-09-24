import { Command } from "../command";
import * as fsi from "../firestore/api";
import { logger } from "../logger";
import { requirePermissions } from "../requirePermissions";
import { Emulators } from "../emulator/types";
import { warnEmulatorNotSupported } from "../emulator/commandUtils";
import { FirestoreOptions } from "../firestore/options";
import { confirm } from "../prompt";
import * as utils from "../utils";
import * as clc from "colorette";
import { logBullet, logLabeledError, logSuccess } from "../utils";
import { FirebaseError } from "../error";

function confirmationMessage(
  options: FirestoreOptions,
  databaseId: string,
  collectionIds: string[],
): string {
  const root = `projects/${options.project}/databases/${databaseId}/documents`;
  return (
    "You are about to delete all documents in the following collection groups: " +
    clc.cyan(collectionIds.map((item) => `"${item}"`).join(", ")) +
    " in " +
    clc.cyan(`"${root}"`) +
    ". Are you sure?"
  );
}

export const command = new Command("firestore:bulkdelete")
  .description("managed bulk delete service to delete data from one or more collection groups")
  .option(
    "--database <databaseName>",
    'Database ID for database to delete from. "(default)" if none is provided.',
  )
  .option(
    "--collection-ids <collectionIds>",
    "A comma-separated list of collection group IDs to delete. Deletes all documents in the specified collection groups.",
  )
  .before(requirePermissions, ["datastore.databases.bulkDeleteDocuments"])
  .before(warnEmulatorNotSupported, Emulators.FIRESTORE)
  .action(async (options: FirestoreOptions) => {
    if (!options.collectionIds) {
      throw new FirebaseError(
        "Missing required flag --collection-ids=[comma separated list of collection groups]",
      );
    }
    let collectionIds: string[] = [];
    try {
      collectionIds = (options.collectionIds as string)
        .split(",")
        .filter((id: string) => id.trim() !== "");
    } catch (e) {
      throw new FirebaseError(
        "The value for --collection-ids must a list of comma separated collection group names",
      );
    }

    if (collectionIds.length === 0) {
      throw new FirebaseError("Must specify at least one collection ID in --collection-ids.");
    }

    const databaseId = options.database || "(default)";

    const api = new fsi.FirestoreApi();

    const confirmed = await confirm({
      message: confirmationMessage(options, databaseId, collectionIds),
      default: false,
      force: options.force,
      nonInteractive: options.nonInteractive,
    });
    if (!confirmed) {
      return utils.reject("Command aborted.", { exit: 1 });
    }

    const op = await api.bulkDeleteDocuments(options.project, databaseId, collectionIds);

    if (options.json) {
      logger.info(JSON.stringify(op, undefined, 2));
    } else {
      if (op.name) {
        logSuccess(`Successfully started bulk delete operation.`);
        logBullet(`Operation name: ` + clc.cyan(op.name));
        // TODO: Update this message to 'firebase firestore:operations:describe' command once it's implemented.
        logBullet(
          "You can monitor the operation's progress using the " +
            clc.cyan(`gcloud firestore operations describe`) +
            ` command.`,
        );
      } else {
        logLabeledError(`Bulk Delete:`, `Failed to start a bulk delete operation.`);
      }
    }

    return op;
  });
