import * as apphosting from "../gcp/apphosting";
import { logger } from "../logger";
import { Command } from "../command";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";

export const command = new Command("apphosting:rollouts:create <backendId> <buildId>")
  .description("create a rollout using a build for an App Hosting backend")
  .option("-l, --location <location>", "specify the region of the backend", "us-central1")
  .option("-i, --id <rolloutId>", "id of the rollout (defaults to autogenerating a random id)", "")
  .before(apphosting.ensureApiEnabled)
  .action(async (backendId: string, buildId: string, options: Options) => {
    const projectId = needProjectId(options);
    const location = options.location as string;
    // TODO: Should we just reuse the buildId?
    const rolloutId =
      (options.buildId as string) ||
      (await apphosting.getNextRolloutId(projectId, location, backendId));
    const build = `projects/${projectId}/backends/${backendId}/builds/${buildId}`;
    const op = await apphosting.createRollout(projectId, location, backendId, rolloutId, {
      build,
    });
    logger.info(`Started a rollout for backend ${backendId} with build ${buildId}.`);
    logger.info("Check status by running:");
    logger.info(`\tfirebase apphosting:rollouts:list --location ${location}`);
    return op;
  });
