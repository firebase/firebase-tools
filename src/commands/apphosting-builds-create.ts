import * as apphosting from "../gcp/apphosting";
import { logger } from "../logger";
import { Command } from "../command";
import { Options } from "../options";
import { generateId } from "../utils";
import { needProjectId } from "../projectUtils";

export const command = new Command("apphosting:builds:create <backendId>")
  .description("Create a build for an App Hosting backend")
  .option("-l, --location <location>", "Specify the region of the backend", "us-central1")
  .option("-i, --id <buildId>", "Id of the build. If not present, autogenerate a random id", "")
  .option("-b, --branch <branch>", "Repository branch to deploy. Defaults to 'main'", "main")
  .before(apphosting.ensureApiEnabled)
  .action(async (backendId: string, options: Options) => {
    const projectId = needProjectId(options);
    const location = options.location as string;
    const buildId = (options.buildId as string) || generateId();
    const branch = options.branch as string;

    const op = await apphosting.createBuild(projectId, location, backendId, buildId, {
      source: {
        codebase: {
          branch: "main",
        },
      },
    });

    logger.info(`Started a build for backend ${backendId} on branch ${branch}.`);
    logger.info("Check status by running:");
    logger.info(`\tfirebase apphosting:builds:get ${backendId} ${buildId} --location ${location}`);
    return op;
  });
