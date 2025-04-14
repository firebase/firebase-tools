import * as apphosting from "../gcp/apphosting";
import { logger } from "../logger";
import { Command } from "../command";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import { logWarning } from "../utils";

export const command = new Command("apphosting:builds:get <backendId> <buildId>")
  .description("get a build for an App Hosting backend")
  .option("-l, --location <location>", "specify the region of the backend")
  .before(apphosting.ensureApiEnabled)
  .action(async (backendId: string, buildId: string, options: Options) => {
    if (options.location !== undefined) {
      logWarning("--location is being removed in the next major release.");
    }
    options.location = options.location ?? "us-central";
    const projectId = needProjectId(options);
    const location = options.location as string;
    const build = await apphosting.getBuild(projectId, location, backendId, buildId);
    logger.info(JSON.stringify(build, null, 2));
    return build;
  });
