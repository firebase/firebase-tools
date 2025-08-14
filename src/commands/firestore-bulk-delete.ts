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

function confirmationMessage(
  options: FirestoreOptions,
  databaseId: string,
  collectionIds: string[],
): string {
  const root = `projects/${options.project}/databases/${databaseId}/documents`;
  if (collectionIds.length === 0) {
    return (
      "You are about to delete " +
      clc.bold(clc.yellow(clc.underline("ALL COLLECTION GROUPS"))) +
      " in " +
      clc.cyan(root) +
      ". Are you sure?"
    );
  }

  return (
    "You are about to delete all documents in the following collection groups: " +
    clc.cyan(collectionIds.map((item) => `"${item}"`).join(", ")) +
    " in " +
    clc.cyan(`"${root}"`) +
    ". Are you sure?"
  );
}

export const command = new Command("firestore:bulk-delete")
  .description("Managed bulk delete service to delete data from one or more collection groups")
  .option(
    "--database <databaseName>",
    'Database ID for database to delete from. "(default)" if none is provided.',
  )
  .option(
    "--collection-ids <collectionIds>",
    "A comma-separated list of collection group IDs to delete. Deletes all documents in the specified collection groups. If not provided, all collections groups will be deleted.",
  )
  .before(requirePermissions, ["datastore.databases.bulkDeleteDocuments"])
  .before(warnEmulatorNotSupported, Emulators.FIRESTORE)
  .before(requirePermissions, ["datastore.entities.list", "datastore.entities.delete"])
  .action(async (options: FirestoreOptions) => {
    const api = new fsi.FirestoreApi();

    const databaseId = options.database || "(default)";
    const collectionIds = ((options.collectionIds as string) || "")
      .split(",")
      .filter((id: string) => id.trim() !== "");

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
      logger.info(`Successfully started bulk delete operation.`);
      logger.info(
        "You can monitor the operation's progress using the 'firebase firestore:operations:describe' command.",
      );
    }

    return op;
  });
