import { Command } from "../command";
import { requirePermissions } from "../requirePermissions";
import { needProjectId } from "../projectUtils";
import * as ailogic from "../gcp/ailogic";
import * as clc from "colorette";
import { logger } from "../logger";
import { FirebaseError } from "../error";
import { confirm } from "../prompt";

import { Options } from "../options";

export const command = new Command("ailogic:providers:disable <providerType>")
  .description("disable a Gemini API provider service")
  .option("-f, --force", "bypass confirmation prompt")
  .before(requirePermissions, ["serviceusage.services.disable", "firebasevertexai.config.update"])
  .action(async (providerType: string, options: Options) => {
    const projectId = needProjectId(options);
    if (providerType !== "gemini-developer-api" && providerType !== "agent-platform-gemini-api") {
      throw new FirebaseError(
        `Invalid provider type: ${clc.bold(providerType)}. Must be 'gemini-developer-api' or 'agent-platform-gemini-api'.`,
      );
    }
    if (options.nonInteractive && !options.force) {
      throw new FirebaseError(
        `Disabling provider ${clc.bold(providerType)} requires confirmation.\n\n` +
          `To proceed in non-interactive mode, rerun with --force:\n\n` +
          `  firebase ailogic:providers:disable ${providerType} --force`,
      );
    }
    const confirmed = await confirm({
      message: `You are about to disable ${clc.bold(providerType)}. This will stop running apps from invoking it. Are you sure?`,
      force: options.force,
      nonInteractive: options.nonInteractive,
    });
    if (!confirmed) {
      throw new FirebaseError("Command aborted.", { exit: 1 });
    }
    await ailogic.disableProvider(projectId, providerType as ailogic.ProviderType);
    logger.info(clc.green(`Successfully disabled provider: ${clc.bold(providerType)}`));
  });
