import * as apphosting from "../gcp/apphosting";
import * as poller from "../operation-poller";
import { logger } from "../logger";
import { Command } from "../command";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import { FirebaseError } from "../error";
import { apphostingOrigin } from "../api";

const apphostingPollerOptions: Omit<poller.OperationPollerOptions, "operationResourceName"> = {
  apiOrigin: apphostingOrigin,
  apiVersion: apphosting.API_VERSION,
  masterTimeout: 25 * 60 * 1_000,
  maxBackoff: 10_000,
};

export const command = new Command("apphosting:rollouts:create <backendId>")
  .description("Create a build for an App Hosting backend")
  .option("-l, --location <location>", "Specify the region of the backend", "us-central1")
  .option("-i, --id <rolloutId>", "Id of the rollout. If not present, autogenerate a random id", "")
  .option("--build <buildId>")
  .option("--gitBranch <gitBranch>")
  .before(apphosting.ensureApiEnabled)
  .action(async (backendId: string, options: Options) => {
    const projectId = needProjectId(options);
    const location = options.location as string | undefined;
    if (!location) {
      throw new FirebaseError("--location must be provided");
    }
    if (options.gitBranch && options.build) {
      throw new FirebaseError("at most one of --build and --gitBranch may be specified");
    }

    const rolloutId =
      (options.id as string) || (await apphosting.getNextRolloutId(projectId, location, backendId));

    const buildId = (options.build as string | undefined) || rolloutId;
    let branch = options.gitBranch as string | undefined;
    if (!(options.build as string | undefined)?.length) {
      if (!branch) {
        const traffic = await apphosting.getTraffic(projectId, location, backendId);
        branch = traffic.rolloutPolicy?.codebaseBranch || "main";
      }
      // Note: awaiting the operation for createRollout should be sufficient to
      // make sure createBuild completes, but there is currently a race
      // condition with new builds.
      logger.info(`Creating build ${buildId} from branch ${branch}`);
      const op = await apphosting.createBuild(projectId, location, backendId, buildId, {
        source: {
          codebase: {
            branch,
          },
        },
      });
      await poller.pollOperation<apphosting.Rollout>({
        ...apphostingPollerOptions,
        pollerName: `createBuild-${projectId}-${location}-${backendId}-${rolloutId}`,
        operationResourceName: op.name,
      });
      logger.info(`Build complete`);
    }

    const build = `projects/${projectId}/backends/${backendId}/builds/${buildId}`;
    const op = await apphosting.createRollout(projectId, location, backendId, rolloutId, {
      build,
    });
    if (options.buildId) {
      logger.info(
        `Started rollout ${rolloutId} for backend ${backendId} with build ${options.buildId as string}.`,
      );
    } else {
      logger.info(
        `Started rollout ${rolloutId} for backend ${backendId} from git branch ${branch as string}`,
      );
    }
    const rollout = await poller.pollOperation<apphosting.Rollout>({
      ...apphostingPollerOptions,
      pollerName: `createRollout-${projectId}-${location}-${backendId}-${rolloutId}`,
      operationResourceName: op.name,
    });
    const backend = await apphosting.getBackend(projectId, location, backendId);
    logger.info(`Rollout complete. Visit the latest content at ${backend.uri}`);
    return rollout;
  });
