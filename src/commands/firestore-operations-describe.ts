import { Command } from "../command";
import * as fsi from "../firestore/api";
import { logger } from "../logger";
import { Emulators } from "../emulator/types";
import { warnEmulatorNotSupported } from "../emulator/commandUtils";
import { FirestoreOptions } from "../firestore/options";
import { FirebaseError } from "../error";
import { PrettyPrint } from "../firestore/pretty-print";

export const command = new Command("firestore:operations:describe <operationName>")
  .description("retrieves information about a Cloud Firestore admin operation")
  .option(
    "--database <databaseName>",
    'Database ID for which the operation is running. "(default)" if none is provided.',
  )
  .before(warnEmulatorNotSupported, Emulators.FIRESTORE)
  .action(async (operationName: string, options: FirestoreOptions) => {
    if (!options.project) {
      throw new FirebaseError(
        "Project is not defined. Either use `--project` or use `firebase use` to set your active project.",
      );
    }

    const databaseId = options.database || "(default)";

    // It's common for users to use full names
    // such as `projects/foo/databases/bar/operations/operation_1`
    // and operation names such as `operation_1` interchangeably.
    // We must support both cases.
    let opName = operationName;
    if (operationName.includes("/operations/")) {
      // Since operationName includes `/operations/`, it is guaranteed
      // that the `split()` will result in a list of 2 or more elements.
      opName = operationName.split("/operations/")[1];
    }

    if (opName.length === 0 || opName.includes("/")) {
      throw new FirebaseError(`"${operationName}" is not a valid operation name.`);
    }

    const api = new fsi.FirestoreApi();
    const operation = await api.describeOperation(options.project, databaseId, opName);

    if (options.json) {
      logger.info(JSON.stringify(operation, undefined, 2));
    } else {
      const printer = new PrettyPrint();
      printer.prettyPrintOperation(operation);
    }

    return operation;
  });
