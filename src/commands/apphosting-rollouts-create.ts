import * as apphosting from "../gcp/apphosting";
import { logger } from "../logger";
import { Command } from "../command";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import { orchestrateRollout } from "../apphosting";
import { FirebaseError } from "../error";
import * as ora from "ora";

export const command = new Command("apphosting:rollouts:create <backendId>")
  .description("create a rollout using a build for an App Hosting backend")
  .option("-l, --location <location>", "specify the region of the backend", "us-central1")
  .option("-i, --id <rolloutId>", "id of the rollout (defaults to autogenerating a random id)", "")
  .option("-b, --branch <branch>", "repository branch to deploy (defaults to 'main')", "")
  .option("-c, --commit <commit>", "git commit to deploy (defaults to the latest commit)", "")
  .before(apphosting.ensureApiEnabled)
  .action(async (backendId: string, options: Options) => {
    if (options.branch && options.commit) {
      throw new FirebaseError(
        "Cannot specify both a branch and commit to deploy. Please try again and specify one of the two.",
      );
    }

    const projectId = needProjectId(options);
    const location = options.location as string;
    const branch = (options.branch as string | undefined) ?? "main";
    const commit = options.commit as string | undefined;

    console.log("branch:", branch);
    console.log("commit:", commit);

    // logger.info(`Creating a new build and rollout for backend ${backendId}...`);
    const createRolloutSpinner = ora(
      "Starting a new rollout; this may take a few minutes. It's safe to exit now.",
    ).start();
    const { rollout, build } = await orchestrateRollout({
      projectId,
      location,
      backendId,
      buildInput: {
        source: {
          codebase: commit ? { commit } : { branch },
        },
      },
    });
    createRolloutSpinner.succeed("Rollout complete");

    logger.info(`Started a rollout for backend ${backendId} with build ${build.name}.`);
    logger.info("Check status by running:");
    logger.info(`\tfirebase apphosting:rollouts:list --location ${location}`);
    return rollout;
  });
