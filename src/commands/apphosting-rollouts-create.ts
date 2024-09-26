import * as apphosting from "../gcp/apphosting";
import { Command } from "../command";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import { FirebaseError } from "../error";
import * as ora from "ora";
import { getRepoDetailsFromBackend, listAllBranches } from "../gcp/devConnect";
import {
  getGitHubBranch,
  getGitHubCommit,
  promptGitHubBranch,
} from "../apphosting/githubConnections";
import { orchestrateRollout } from "../apphosting";
import { confirm } from "../prompt";
import { logBullet } from "../utils";
import { consoleOrigin } from "../api";

export const command = new Command("apphosting:rollouts:create <backendId>")
  .description("create a rollout using a build for an App Hosting backend")
  .option("-l, --location <location>", "specify the region of the backend", "us-central1")
  .option("-i, --id <rolloutId>", "id of the rollout (defaults to autogenerating a random id)", "")
  .option("-b, --git-branch <gitBranch>", "repository branch to deploy (defaults to 'main')", "")
  .option("-c, --commit <commit>", "git commit to deploy (defaults to the latest commit)", "")
  .option("-f, --force", "skip confirmation")
  .before(apphosting.ensureApiEnabled)
  .action(async (backendId: string, options: Options) => {
    const projectId = needProjectId(options);
    const location = options.location as string;

    let branch = options.gitBranch as string | undefined;
    const commit = options.commit as string | undefined;
    if (branch && commit) {
      throw new FirebaseError(
        "Cannot specify both a branch and commit to deploy. Please specify either --git-branch or --commit.",
      );
    }
    const backend = await apphosting.getBackend(projectId, location, backendId);
    if (!backend.codebase.repository) {
      throw new FirebaseError(
        `Failed to find connected Git repository for backend ${backendId}. Please check that your backend has been successfully linked to a Git repository.`,
      );
    }
    const { repoLink, owner, repo, readToken } = await getRepoDetailsFromBackend(
      projectId,
      location,
      backend.codebase.repository,
    );

    let target;
    if (branch) {
      const branches = await listAllBranches(repoLink.name);
      if (!branches.has(branch)) {
        throw new FirebaseError(
          `Unrecognized git branch ${branch}. Please double-check your branch name and try again.`,
        );
      }
      const branchInfo = await getGitHubBranch(owner, repo, branch, readToken.token);
      target = branchInfo.commit;
    } else if (commit) {
      if (!/^(?:[0-9a-f]{40}|[0-9a-f]{7})$/.test(commit)) {
        throw new FirebaseError(`Invalid git commit ${commit}. Must be a valid SHA1 hash.`);
      }
      try {
        const commitInfo = await getGitHubCommit(owner, repo, commit, readToken.token);
        target = commitInfo;
      } catch (err: unknown) {
        if ((err as FirebaseError).status === 422) {
          throw new FirebaseError(
            `Unrecognized git commit ${commit}. Please double-check your commit hash and try again.`,
          );
        }
        throw err;
      }
    } else {
      branch = await promptGitHubBranch(repoLink);
      const branchInfo = await getGitHubBranch(owner, repo, branch, readToken.token);
      target = branchInfo.commit;
    }

    logBullet(`You are about to deploy [${target.sha.substring(0, 7)}]: ${target.commit.message}`);
    const confirmRollout = await confirm({
      force: options.force,
      message: "Do you want to continue?",
    });
    if (!confirmRollout) {
      return;
    }
    logBullet(
      `You may also track this rollout at:\n\t${consoleOrigin()}/project/${projectId}/apphosting`,
    );

    const createRolloutSpinner = ora(
      "Starting a new rollout; this may take a few minutes. It's safe to exit now.",
    ).start();

    let rollout;
    try {
      ({ rollout } = await orchestrateRollout({
        projectId,
        location,
        backendId,
        buildInput: {
          source: {
            codebase: {
              commit: target.sha,
            },
          },
        },
      }));
    } catch (err: unknown) {
      createRolloutSpinner.fail("Rollout failed.");
      throw err;
    }
    createRolloutSpinner.succeed("Successfully created a new rollout!");
    return rollout;
  });
