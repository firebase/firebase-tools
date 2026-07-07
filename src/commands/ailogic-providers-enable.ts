import { Command } from "../command";
import { requirePermissions } from "../requirePermissions";
import { needProjectId } from "../projectUtils";
import * as ailogic from "../gcp/ailogic";
import * as clc from "colorette";
import { logger } from "../logger";
import { FirebaseError } from "../error";

import { Options } from "../options";

export const command = new Command("ailogic:providers:enable <providerType>")
  .description("enable a Gemini API provider service")
  .before(requirePermissions, ["serviceusage.services.enable", "firebasevertexai.config.update"])
  .action(async (providerType: string, options: Options) => {
    const projectId = needProjectId(options);
    if (providerType !== "gemini-developer-api" && providerType !== "agent-platform-gemini-api") {
      throw new FirebaseError(
        `Invalid provider type: ${clc.bold(providerType)}. Must be 'gemini-developer-api' or 'agent-platform-gemini-api'.`,
      );
    }
    await ailogic.enableProvider(projectId, providerType as ailogic.ProviderType);
    logger.info(clc.green(`Successfully enabled provider: ${clc.bold(providerType)}`));
  });
