import * as apphosting from "../gcp/apphosting";
import { logger } from "../logger";
import { Command } from "../command";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import { logWarning } from "../utils";

export const command = new Command("apphosting:rollouts:list <backendId>")
  .description("list rollouts of an App Hosting backend")
  .option(
    "-l, --location <location>",
    "region of the rollouts (defaults to listing rollouts from all regions)",
  )
  .before(apphosting.ensureApiEnabled)
  .action(async (backendId: string, options: Options) => {
    if (options.location !== undefined) {
      logWarning("--location is being removed in the next major release.");
    }
    const projectId = needProjectId(options);
    const location = (options.location as string) ?? "-";
    const rollouts = await apphosting.listRollouts(projectId, location, backendId);
    if (rollouts.unreachable) {
      logger.error(
        `WARNING: the following locations were unreachable: ${rollouts.unreachable.join(", ")}`,
      );
    }
    logger.info(JSON.stringify(rollouts.rollouts, null, 2));
    return rollouts;
  });
