import { Command } from "../command";
import { requirePermissions } from "../requirePermissions";
import { needProjectId } from "../projectUtils";
import * as ailogic from "../gcp/ailogic";
import * as clc from "colorette";
import { logger } from "../logger";

import { Options } from "../options";

export const command = new Command("ailogic:providers:enable <providerType>")
  .description("enable a Gemini API provider service")
  .help(
    `enables the Google Cloud APIs that back a Gemini API provider, along with the Firebase AI Logic API.

Valid values for <providerType>:

  gemini-developer-api       the Gemini Developer API
  gemini-agent-platform-api  the Gemini API on the Agent Platform; requires the Blaze (pay-as-you-go) plan

For example:

  firebase ailogic:providers:enable gemini-developer-api`,
  )
  .before(requirePermissions, ["serviceusage.services.enable", "firebasevertexai.config.update"])
  .action(async (providerType: string, options: Options) => {
    const projectId = needProjectId(options);
    const provider = ailogic.parseProviderType(providerType);
    await ailogic.enableProvider(projectId, provider);
    logger.info(clc.green(`Successfully enabled provider: ${clc.bold(provider)}`));
  });
