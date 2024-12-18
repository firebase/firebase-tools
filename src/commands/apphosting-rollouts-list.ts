import * as apphosting from "../gcp/apphosting.js";
import { logger } from "../logger.js";
import { Command } from "../command.js";
import { Options } from "../options.js";
import { needProjectId } from "../projectUtils.js";

export const command = new Command("apphosting:rollouts:list <backendId>")
  .description("list rollouts of an App Hosting backend")
  .option(
    "-l, --location <location>",
    "region of the rollouts (defaults to listing rollouts from all regions)",
    "-",
  )
  .before(apphosting.ensureApiEnabled)
  .action(async (backendId: string, options: Options) => {
    const projectId = needProjectId(options);
    const location = options.location as string;
    const rollouts = await apphosting.listRollouts(projectId, location, backendId);
    if (rollouts.unreachable) {
      logger.error(
        `WARNING: the following locations were unreachable: ${rollouts.unreachable.join(", ")}`,
      );
    }
    logger.info(JSON.stringify(rollouts.rollouts, null, 2));
    return rollouts;
  });
