import { Command } from "../command";
import { requirePermissions } from "../requirePermissions";
import { needProjectId } from "../projectUtils";
import * as ailogic from "../gcp/ailogic";
import * as clc from "colorette";
import { logger } from "../logger";
import * as Table from "cli-table3";

import { Options } from "../options";

const PREVIEW_LENGTH = 60;
const ELLIPSIS = "...";

export const command = new Command("ailogic:templates:list")
  .description("list deployed templates")
  .before(requirePermissions, ["firebasevertexai.templates.get"])
  .action(async (options: Options) => {
    const projectId = needProjectId(options);
    if (!(await ailogic.isAILogicApiEnabled(projectId))) {
      logger.info("Firebase AI Logic is not enabled on this project.");
      return [];
    }
    const templates = await ailogic.listTemplates(projectId);

    if (templates.length === 0) {
      logger.info(clc.bold("No deployed templates found."));
      return templates;
    }

    const table = new Table({
      head: ["Template ID", "Display Name", "Locked", "Template Preview"],
      style: { head: ["green"] },
    });

    for (const t of templates) {
      // Defensive: list responses may elide large fields.
      const templateString = t.templateString ?? "";
      const preview =
        templateString.length > PREVIEW_LENGTH
          ? templateString.substring(0, PREVIEW_LENGTH - ELLIPSIS.length) + ELLIPSIS
          : templateString;
      table.push([
        clc.bold(ailogic.templateIdFromName(t.name)),
        t.displayName || "",
        t.locked ? "Yes" : "No",
        preview.replace(/\n/g, " "),
      ]);
    }

    logger.info(table.toString());
    return templates;
  });
