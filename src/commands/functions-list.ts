import { Command } from "../command.js";
import { FirebaseError } from "../error.js";
import * as args from "../deploy/functions/args.js";
import { needProjectId } from "../projectUtils.js";
import { Options } from "../options.js";
import { requirePermissions } from "../requirePermissions.js";
import * as backend from "../deploy/functions/backend.js";
import { logger } from "../logger.js";
import Table from "cli-table";

export const command = new Command("functions:list")
  .description("list all deployed functions in your Firebase project")
  .before(requirePermissions, ["cloudfunctions.functions.list"])
  .action(async (options: Options) => {
    try {
      const context = {
        projectId: needProjectId(options),
      } as args.Context;
      const existing = await backend.existingBackend(context);
      const endpointsList = backend.allEndpoints(existing).sort(backend.compareFunctions);
      const table = new Table({
        head: ["Function", "Version", "Trigger", "Location", "Memory", "Runtime"],
        style: { head: ["yellow"] },
      });
      for (const endpoint of endpointsList) {
        const trigger = backend.endpointTriggerType(endpoint);
        const availableMemoryMb = endpoint.availableMemoryMb || "---";
        const entry = [
          endpoint.id,
          endpoint.platform === "gcfv2" ? "v2" : "v1",
          trigger,
          endpoint.region,
          availableMemoryMb,
          endpoint.runtime,
        ];
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
