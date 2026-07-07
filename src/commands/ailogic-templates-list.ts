import { Command } from "../command";
import { requirePermissions } from "../requirePermissions";
import { needProjectId } from "../projectUtils";
import * as ailogic from "../gcp/ailogic";
import * as clc from "colorette";
import { logger } from "../logger";
import * as Table from "cli-table3";

import { Options } from "../options";

export const command = new Command("ailogic:templates:list")
  .description("list deployed templates")
  .before(requirePermissions, ["firebasevertexai.templates.get"])
  .action(async (options: Options) => {
    const projectId = needProjectId(options);
    await ailogic.ensureAILogicApiEnabled(projectId, options);
    const templates = await ailogic.listTemplates(projectId, "global");

    if (templates.length === 0) {
      logger.info(clc.bold("No deployed templates found."));
      return templates;
    }

    const tableHead = ["Template ID", "Display Name", "Locked", "Template Preview"];
    const table = new Table({ head: tableHead, style: { head: ["green"] } });

    for (const t of templates) {
      const templateId = t.name.split("/").pop() || "";
      const preview =
        t.templateString.length > 60 ? t.templateString.substring(0, 57) + "..." : t.templateString;
      table.push([
        clc.bold(templateId),
        t.displayName || "",
        t.locked ? "Yes" : "No",
        preview.replace(/\n/g, " "),
      ]);
    }

    logger.info(table.toString());
    return templates;
  });
