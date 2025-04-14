import * as apphosting from "../gcp/apphosting";
import { Command } from "../command";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import { FirebaseError } from "../error";
import { createRollout } from "../apphosting/rollout";

export const command = new Command("apphosting:rollouts:create <backendId>")
  .description("create a rollout using a build for an App Hosting backend")
  .option(
    "-b, --git-branch <gitBranch>",
    "repository branch to deploy (mutually exclusive with -g)",
  )
  .option("-g, --git-commit <gitCommit>", "git commit to deploy (mutually exclusive with -b)")
  .withForce("Skip confirmation before creating rollout")
  .before(apphosting.ensureApiEnabled)
  .action(async (backendId: string, options: Options) => {
    const projectId = needProjectId(options);

    const branch = options.gitBranch as string | undefined;
    const commit = options.gitCommit as string | undefined;
    if (branch && commit) {
      throw new FirebaseError(
        "Cannot specify both a branch and commit to deploy. Please specify either --git-branch or --git-commit.",
      );
    }

    await createRollout(backendId, projectId, branch, commit, options.force);
  });
