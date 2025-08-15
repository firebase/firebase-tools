import { Command } from "../command";
import * as fsi from "../firestore/api";
import { logger } from "../logger";
import { Emulators } from "../emulator/types";
import { warnEmulatorNotSupported } from "../emulator/commandUtils";
import { FirestoreOptions } from "../firestore/options";
import { FirebaseError } from "../error";
import { PrettyPrint } from "../firestore/pretty-print";

export const command = new Command("firestore:operations:list")
  .description("list pending Cloud Firestore admin operations and their status")
  .option(
    "--database <databaseName>",
    'Database ID for database to list operations for. "(default)" if none is provided.',
  )
  .option("--limit <number>", "The maximum number of operations to list. Uses 100 by default.")
  .before(warnEmulatorNotSupported, Emulators.FIRESTORE)
  .action(async (options: FirestoreOptions) => {
    if (!options.project) {
      throw new FirebaseError(
        "Project is not defined. Either use `--project` or use `firebase use` to set your active project.",
      );
    }
    const databaseId = options.database || "(default)";
    const limit = (options.limit as number) || 100;

    const api = new fsi.FirestoreApi();
    const { operations } = await api.listOperations(options.project, databaseId, limit);

    if (options.json) {
      logger.info(JSON.stringify(operations, undefined, 2));
    } else {
      const printer = new PrettyPrint();
      printer.prettyPrintOperations(operations);
    }

    return operations;
  });
