import * as apphosting from "../gcp/apphosting";
import { logger } from "../logger";
import { Command } from "../command";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";

export const command = new Command("apphosting:builds:get <backendId> <buildId>")
  .description("get a build for an App Hosting backend")
  .option("-l, --location <location>", "specify the region of the backend", "us-central1")
  .before(apphosting.ensureApiEnabled)
  .action(async (backendId: string, buildId: string, options: Options) => {
    const projectId = needProjectId(options);
    const location = options.location as string;
    const build = await apphosting.getBuild(projectId, location, backendId, buildId);
    logger.info(JSON.stringify(build, null, 2));
    return build;
  });
