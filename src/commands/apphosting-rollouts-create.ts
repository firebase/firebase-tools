import * as apphosting from "../gcp/apphosting";
import { logger } from "../logger";
import { Command } from "../command";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import { orchestrateRollout } from "../apphosting";
// import * as ora from "ora";

export const command = new Command("apphosting:rollouts:create <backendId>")
  .description("create a rollout using a build for an App Hosting backend")
  .option("-l, --location <location>", "specify the region of the backend", "us-central1")
  .option("-i, --id <rolloutId>", "id of the rollout (defaults to autogenerating a random id)", "")
  .option("-b, --branch <branch>", "repository branch to deploy (defaults to 'main')", "main")
  .before(apphosting.ensureApiEnabled)
  .action(async (backendId: string, options: Options) => {
    const projectId = needProjectId(options);
    const location = options.location as string;
    const branch = (options.branch as string | undefined) ?? "main";

    logger.info(`Creating a new build and rollout for backend ${backendId}...`);
    const { rollout, build } = await orchestrateRollout({
      projectId,
      location,
      backendId,
      buildInput: {
        source: {
          codebase: {
            branch,
          },
        },
      },
    });

    logger.info(`Started a rollout for backend ${backendId} with build ${build.name}.`);
    logger.info("Check status by running:");
    logger.info(`\tfirebase apphosting:rollouts:list --location ${location}`);
    return rollout;
  });
