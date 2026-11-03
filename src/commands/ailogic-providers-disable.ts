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
  .help(
    `disables the Google Cloud API that backs a Gemini API provider. Running apps that use the provider will no longer be able to invoke it.

Valid values for <providerType>:

  gemini-developer-api       the Gemini Developer API
  gemini-agent-platform-api  the Gemini API on the Agent Platform

For example:

  firebase ailogic:providers:disable gemini-developer-api`,
  )
  .option("-f, --force", "bypass confirmation prompt")
  .before(requirePermissions, ["serviceusage.services.disable", "firebasevertexai.config.update"])
  .action(async (providerType: string, options: Options) => {
    const projectId = needProjectId(options);
    const provider = ailogic.parseProviderType(providerType);
    // confirm() aborts (throws) in non-interactive mode unless --force is set, so a
    // separate non-interactive guard is unnecessary here.
    const confirmed = await confirm({
      message: `You are about to disable ${clc.bold(provider)}. This will stop running apps from invoking it. Are you sure?`,
      force: options.force,
      nonInteractive: options.nonInteractive,
    });
    if (!confirmed) {
      throw new FirebaseError("Command aborted.", { exit: 1 });
    }
    await ailogic.disableProvider(projectId, provider);
    logger.info(clc.green(`Successfully disabled provider: ${clc.bold(provider)}`));
  });
