import { Command } from "../command";
import { FirebaseError } from "../error";
import * as args from "../deploy/functions/args";
import { needProjectId } from "../projectUtils";
import { Options } from "../options";
import { requirePermissions } from "../requirePermissions";
import * as backend from "../deploy/functions/backend";
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
      const existing = await backend.existingBackend(context);
      const endpointsList = backend.allEndpoints(existing).sort(backend.compareFunctions);
      const table = previews.functionsv2
        ? new Table({
            head: ["Function", "Version", "Trigger", "Location", "Memory", "Runtime"],
            style: { head: ["yellow"] },
          })
        : new Table({
            head: ["Function", "Trigger", "Location", "Memory", "Runtime"],
            style: { head: ["yellow"] },
          });
      for (const endpoint of endpointsList) {
        const trigger = backend.endpointTriggerType(endpoint);
        const availableMemoryMb = endpoint.availableMemoryMb || "---";
        const entry = previews.functionsv2
          ? [
              endpoint.id,
              endpoint.platform === "gcfv2" ? "v2" : "v1",
              trigger,
              endpoint.region,
              availableMemoryMb,
              endpoint.runtime,
            ]
          : [endpoint.id, trigger, endpoint.region, availableMemoryMb, endpoint.runtime];
        table.push(entry);
      }
      logger.info(table.toString());
      return endpointsList;
    } catch (err: any) {
      throw new FirebaseError("Failed to list functions", {
        exit: 1,
        original: err,
      });
    }
  });
