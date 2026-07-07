import { Command } from "../command";
import { requirePermissions } from "../requirePermissions";
import { needProjectId } from "../projectUtils";
import * as ailogic from "../gcp/ailogic";
import * as clc from "colorette";
import { logger } from "../logger";
import * as Table from "cli-table3";

import { Options } from "../options";

export const command = new Command("ailogic:triggers:list")
  .description("list registered triggers")
  .before(requirePermissions, ["firebasevertexai.triggers.get"])
  .action(async (options: Options) => {
    const projectId = needProjectId(options);
    await ailogic.ensureAILogicApiEnabled(projectId, options);
    const triggers = await ailogic.listTriggers(projectId, "global");

    if (triggers.length === 0) {
      logger.info(clc.bold("No registered triggers found."));
      return triggers;
    }

    const tableHead = ["Trigger ID", "Function ID", "Function Region"];
    const table = new Table({ head: tableHead, style: { head: ["green"] } });

    for (const t of triggers) {
      const triggerId = t.name.split("/").pop() || "";
      table.push([
        clc.bold(triggerId),
        t.cloudFunction?.id || "",
        t.cloudFunction?.locationId || "",
      ]);
    }

    logger.info(table.toString());
    return triggers;
  });
