import { Command } from "../command";
import { FirebaseError } from "../error";
import * as args from "../deploy/functions/args";
import { needProjectId } from "../projectUtils";
import { Options } from "../options";
import { requirePermissions } from "../requirePermissions";
import * as backend from "../deploy/functions/backend";
import { listFunctions } from "../functions/listFunctions";
import { previews } from "../previews";
import { logger } from "../logger";
import Table = require("cli-table");

export default new Command("functions:list")
  .description("list all deployed functions in your Firebase project")
  .before(requirePermissions, ["cloudfunctions.functions.list"])
  .action(async (options: Options) => {
    try {
      const context = {
        projectId: needProjectId(options),
      } as args.Context;
      const functionList = await listFunctions(context);
      const table = previews.functionsv2
        ? new Table({
            head: ["Function", "Version", "Trigger", "Location", "Memory", "Runtime"],
            style: { head: ["yellow"] },
          })
        : new Table({
            head: ["Function", "Trigger", "Location", "Memory", "Runtime"],
            style: { head: ["yellow"] },
          });
      for (const fnSpec of functionList.functions) {
        const trigger = backend.isEventTrigger(fnSpec.trigger) ? fnSpec.trigger.eventType : "https";
        const availableMemoryMb = fnSpec.availableMemoryMb || "---";
        const entry = previews.functionsv2
          ? [
              fnSpec.entryPoint,
              fnSpec.platform === "gcfv2" ? "v2" : "v1",
              trigger,
              fnSpec.region,
              availableMemoryMb,
              fnSpec.runtime,
            ]
          : [fnSpec.entryPoint, trigger, fnSpec.region, availableMemoryMb, fnSpec.runtime];
        table.push(entry);
      }
      logger.info(table.toString());
      return functionList;
    } catch (err) {
      throw new FirebaseError(`Failed to list functions ${err.message}`, {
        exit: 1,
        original: err,
      });
    }
  });
