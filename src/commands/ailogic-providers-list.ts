import { Command } from "../command";
import { requirePermissions } from "../requirePermissions";
import { needProjectId } from "../projectUtils";
import * as ailogic from "../gcp/ailogic";
import * as clc from "colorette";
import { logger } from "../logger";
import * as Table from "cli-table3";

import { Options } from "../options";

export const command = new Command("ailogic:providers:list")
  .description("list which Gemini API providers are enabled")
  .before(requirePermissions, ["serviceusage.services.get"])
  .action(async (options: Options) => {
    const projectId = needProjectId(options);
    const enabledProviders = await ailogic.listProviders(projectId);

    if (enabledProviders.length === 0) {
      logger.info(clc.bold("No Gemini API providers are enabled."));
      return enabledProviders;
    }

    const tableHead = ["Provider", "Status"];
    const table = new Table({ head: tableHead, style: { head: ["green"] } });

    // Show every possible provider, indicating whether it is enabled or disabled.
    for (const provider of ailogic.PROVIDER_TYPES) {
      const isEnabled = enabledProviders.includes(provider);
      table.push([clc.bold(provider), isEnabled ? clc.green("Enabled") : clc.red("Disabled")]);
    }

    logger.info(table.toString());
    return enabledProviders;
  });
