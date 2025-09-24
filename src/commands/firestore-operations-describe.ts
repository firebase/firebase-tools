import { Command } from "../command";
import * as fsi from "../firestore/api";
import { logger } from "../logger";
import { Emulators } from "../emulator/types";
import { errorMissingProject, warnEmulatorNotSupported } from "../emulator/commandUtils";
import { FirestoreOptions } from "../firestore/options";
import { PrettyPrint } from "../firestore/pretty-print";
import { getShortOperationName } from "./firestore-utils";

export const command = new Command("firestore:operations:describe <operationName>")
  .description("retrieves information about a Cloud Firestore admin operation")
  .option(
    "--database <databaseName>",
    'Database ID for which the operation is running. "(default)" if none is provided.',
  )
  .before(errorMissingProject)
  .before(warnEmulatorNotSupported, Emulators.FIRESTORE)
  .action(async (operationName: string, options: FirestoreOptions) => {
    const databaseId = options.database || "(default)";
    operationName = getShortOperationName(operationName);
    const api = new fsi.FirestoreApi();
    const operation = await api.describeOperation(options.project, databaseId, operationName);

    if (options.json) {
      logger.info(JSON.stringify(operation, undefined, 2));
    } else {
      const printer = new PrettyPrint();
      printer.prettyPrintOperation(operation);
    }

    return operation;
  });
