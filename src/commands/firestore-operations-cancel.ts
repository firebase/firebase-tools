import { Command } from "../command";
import * as fsi from "../firestore/api";
import { Emulators } from "../emulator/types";
import { errorMissingProject, warnEmulatorNotSupported } from "../emulator/commandUtils";
import { FirestoreOptions } from "../firestore/options";
import { getShortOperationName } from "./firestore-utils";
import { confirm } from "../prompt";
import * as clc from "colorette";
import * as utils from "../utils";
import { logger } from "../logger";

export const command = new Command("firestore:operations:cancel <operationName>")
  .description("cancels a long-running Cloud Firestore admin operation")
  .option(
    "--database <databaseName>",
    'Database ID for which the operation is running. "(default)" if none is provided.',
  )
  .option("--force", "Forces the operation cancellation without asking for confirmation")
  .before(errorMissingProject)
  .before(warnEmulatorNotSupported, Emulators.FIRESTORE)
  .action(async (operationName: string, options: FirestoreOptions) => {
    const databaseId = options.database || "(default)";
    operationName = getShortOperationName(operationName);

    if (!options.force) {
      const fullName = `/projects/${options.project}/databases/${databaseId}/operations/${operationName}`;
      const confirmMessage = `You are about to cancel the operation: ${clc.bold(clc.yellow(clc.underline(fullName)))}. Do you wish to continue?`;
      const consent = await confirm(confirmMessage);
      if (!consent) {
        return utils.reject("Command aborted.", { exit: 1 });
      }
    }

    const api = new fsi.FirestoreApi();
    const status = await api.cancelOperation(options.project, databaseId, operationName);

    if (status.success) {
      utils.logSuccess("Operation cancelled successfully.");
    } else {
      utils.logWarning("Canceling the operation failed.");
    }

    return status;
  });
