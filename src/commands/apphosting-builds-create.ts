import * as apphosting from "../gcp/apphosting";
import { logger } from "../logger";
import { Command } from "../command";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import { logWarning } from "../utils";

export const command = new Command("apphosting:builds:create <backendId>")
  .description("create a build for an App Hosting backend")
  .option("-l, --location <location>", "specify the region of the backend")
  .option("-i, --id <buildId>", "id of the build (defaults to autogenerating a random id)", "")
  .option("-b, --branch <branch>", "repository branch to deploy (defaults to 'main')", "main")
  .before(apphosting.ensureApiEnabled)
  .action(async (backendId: string, options: Options) => {
    const projectId = needProjectId(options);
    if (options.location !== undefined) {
      logWarning("--location is being removed in the next major release.");
    }
    const location = (options.location as string) ?? "us-central1";
    const buildId =
      (options.buildId as string) ||
      (await apphosting.getNextRolloutId(projectId, location, backendId));
    const branch = (options.branch as string | undefined) ?? "main";

    const op = await apphosting.createBuild(projectId, location, backendId, buildId, {
      source: {
        codebase: {
          branch,
        },
      },
    });

    logger.info(`Started a build for backend ${backendId} on branch ${branch}.`);
    logger.info("Check status by running:");
    logger.info(`\tfirebase apphosting:builds:get ${backendId} ${buildId} --location ${location}`);
    return op;
  });
