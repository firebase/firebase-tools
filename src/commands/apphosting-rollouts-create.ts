import * as apphosting from "../gcp/apphosting";
import { Command } from "../command";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import { requireAuth } from "../requireAuth";
import { FirebaseError } from "../error";
import { createRollout } from "../apphosting/rollout";

export const command = new Command("apphosting:rollouts:create <backendId>")
  .description(
    "create a build and rollout for an App Hosting backend from a branch or commit of its connected GitHub repository (fails if <backendId> exists in more than one region)",
  )
  .option(
    "-b, --git-branch <gitBranch>",
    "repository branch to deploy (mutually exclusive with -g). If neither -b nor -g is set, prompts for a branch; required with --non-interactive",
  )
  .option(
    "-g, --git-commit <gitCommit>",
    "git commit SHA (7 or 40 characters) to deploy (mutually exclusive with -b)",
  )
  .withForce("fail instead of prompting for a branch when neither -b nor -g is set")
  .before(requireAuth)
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
    if (!branch && !commit && options.nonInteractive) {
      throw new FirebaseError(
        "No branch or commit was specified to deploy in non-interactive mode. Please specify which branch or commit to roll out with the --git-branch or --git-commit flag.",
      );
    }

    await createRollout(backendId, projectId, branch, commit, options.force);
  });
