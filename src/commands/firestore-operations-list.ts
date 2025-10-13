import { Command } from "../command";
import * as fsi from "../firestore/api";
import { Emulators } from "../emulator/types";
import { errorMissingProject, warnEmulatorNotSupported } from "../emulator/commandUtils";
import { FirestoreOptions } from "../firestore/options";
import { PrettyPrint } from "../firestore/pretty-print";

export const command = new Command("firestore:operations:list [fileOrOperationName...]")
  .description("list pending Cloud Firestore admin operations and their status")
  .option(
    "--database <databaseName>",
    'Database ID for database to list operations for. "(default)" if none is provided.',
  )
  .option("--limit <number>", "The maximum number of operations to list. Uses 100 by default.")
  .before(errorMissingProject)
  .before(warnEmulatorNotSupported, Emulators.FIRESTORE)
  .action(async (options: FirestoreOptions) => {
    const databaseId = options.database || "(default)";
    const limit = options.limit === undefined ? 100 : Number(options.limit);

    const api = new fsi.FirestoreApi();
    const { operations } = await api.listOperations(options.project, databaseId, limit);

    const printer = new PrettyPrint();
    printer.prettyPrintOperations(operations);

    return operations;
  });
