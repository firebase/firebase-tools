import * as apphosting from "../gcp/apphosting";
import { logger } from "../logger";
import { Command } from "../command";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";

export const command = new Command("apphosting:rollouts:list <backendId>")
  .description("List rollouts of an App Hosting backend")
  .option(
    "-l, --location <location>",
    "Rgion of the rollouts. Defaults to listing rollouts from all regions",
    "-",
  )
  .before(apphosting.ensureApiEnabled)
  .action(async (backendId: string, options: Options) => {
    const projectId = needProjectId(options);
    const location = options.location as string;
    const rollouts = await apphosting.listRollouts(projectId, location, backendId);
    logger.info(JSON.stringify(rollouts, null, 2));
    return rollouts;
  });
