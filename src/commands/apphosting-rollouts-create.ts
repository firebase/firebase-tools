import * as apphosting from "../gcp/apphosting.js";
import { Command } from "../command.js";
import { Options } from "../options.js";
import { needProjectId } from "../projectUtils.js";
import { FirebaseError } from "../error.js";
import { createRollout } from "../apphosting/rollout.js";

export const command = new Command("apphosting:rollouts:create <backendId>")
  .description("create a rollout using a build for an App Hosting backend")
  .option("-l, --location <location>", "specify the region of the backend", "-")
  .option(
    "-b, --git-branch <gitBranch>",
    "repository branch to deploy (mutually exclusive with -g)",
  )
  .option("-g, --git-commit <gitCommit>", "git commit to deploy (mutually exclusive with -b)")
  .withForce("Skip confirmation before creating rollout")
  .before(apphosting.ensureApiEnabled)
  .action(async (backendId: string, options: Options) => {
    const projectId = needProjectId(options);
    const location = options.location as string;

    const branch = options.gitBranch as string | undefined;
    const commit = options.gitCommit as string | undefined;
    if (branch && commit) {
      throw new FirebaseError(
        "Cannot specify both a branch and commit to deploy. Please specify either --git-branch or --git-commit.",
      );
    }

    await createRollout(backendId, projectId, location, branch, commit, options.force);
  });
