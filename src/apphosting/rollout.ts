import * as apphosting from "../gcp/apphosting";
import { FirebaseError } from "../error";
import * as ora from "ora";
import { getRepoDetailsFromBackend, listAllBranches } from "../gcp/devConnect";
import {
  getGitHubBranch,
  getGitHubCommit,
  GitHubCommitInfo,
  promptGitHubBranch,
} from "../apphosting/githubConnections";
import * as poller from "../operation-poller";

import { logBullet, sleep } from "../utils";
import { apphostingOrigin, consoleOrigin } from "../api";
import { DeepOmit } from "../metaprogramming";
import { getBackend } from "./backend";

const apphostingPollerOptions: Omit<poller.OperationPollerOptions, "operationResourceName"> = {
  apiOrigin: apphostingOrigin(),
  apiVersion: apphosting.API_VERSION,
  masterTimeout: 25 * 60 * 1_000,
  maxBackoff: 10_000,
};

const GIT_COMMIT_SHA_REGEX = /^(?:[0-9a-f]{40}|[0-9a-f]{7})$/;

/**
 * Create a new App Hosting rollout for a backend.
 * Implements core logic for apphosting:rollouts:create command.
 */
export async function createRollout(
  backendId: string,
  projectId: string,
  branch?: string,
  commit?: string,
  force?: boolean,
): Promise<void> {
  const backend = await getBackend(projectId, backendId);

  if (!backend.codebase.repository) {
    throw new FirebaseError(
      `Backend ${backendId} is misconfigured due to missing a connected repository. You can delete and recreate your backend using 'firebase apphosting:backends:delete' and 'firebase apphosting:backends:create'.`,
    );
  }

  const { location } = apphosting.parseBackendName(backend.name);
  const { repoLink, owner, repo, readToken } = await getRepoDetailsFromBackend(
    projectId,
    location,
    backend.codebase.repository,
  );

  let targetCommit: GitHubCommitInfo;
  if (branch) {
    const branches = await listAllBranches(repoLink.name);
    if (!branches.has(branch)) {
      throw new FirebaseError(
        `Unrecognized git branch ${branch}. Please double-check your branch name and try again.`,
      );
    }
    const branchInfo = await getGitHubBranch(owner, repo, branch, readToken.token);
    targetCommit = branchInfo.commit;
  } else if (commit) {
    if (!GIT_COMMIT_SHA_REGEX.test(commit)) {
      throw new FirebaseError(`Invalid git commit ${commit}. Must be a valid SHA1 hash.`);
    }
    try {
      const commitInfo = await getGitHubCommit(owner, repo, commit, readToken.token);
      targetCommit = commitInfo;
    } catch (err: unknown) {
      // 422 HTTP status code returned by GitHub indicates it was unable to find the commit.
      if ((err as FirebaseError).status === 422) {
        throw new FirebaseError(
          `Unrecognized git commit ${commit}. Please double-check your commit hash and try again.`,
        );
      }
      throw err;
    }
  } else {
    if (force) {
      throw new FirebaseError(
        `Failed to create rollout with --force option because no target branch or commit was specified. Please specify which branch or commit to roll out with the --git-branch or --git-commit flag.`,
      );
    }
    branch = await promptGitHubBranch(repoLink);
    const branchInfo = await getGitHubBranch(owner, repo, branch, readToken.token);
    targetCommit = branchInfo.commit;
  }

  logBullet(
    `You are about to deploy [${targetCommit.sha.substring(0, 7)}]: ${targetCommit.commit.message}`,
  );
  logBullet(
    `You may also track this rollout at:\n\t${consoleOrigin()}/project/${projectId}/apphosting`,
  );

  const createRolloutSpinner = ora(
    "Starting a new rollout; this may take a few minutes. It's safe to exit now.",
  ).start();

  try {
    await orchestrateRollout({
      projectId,
      location,
      backendId,
      buildInput: {
        source: {
          codebase: {
            commit: targetCommit.sha,
          },
        },
      },
    });
  } catch (err: unknown) {
    createRolloutSpinner.fail("Rollout failed.");
    throw err;
  }
  createRolloutSpinner.succeed("Successfully created a new rollout!");
}

interface OrchestrateRolloutArgs {
  projectId: string;
  location: string;
  backendId: string;
  buildInput: DeepOmit<apphosting.Build, apphosting.BuildOutputOnlyFields | "name">;
  // Used to determine if a rollout ID needs to be computed.
  // If we know this is the first rollout for a backend,
  // we can avoid multiple API calls and default to:
  // build-{year}-{month}-{day}-001.
  isFirstRollout?: boolean;
}

/**
 * Creates a new build and rollout and polls both to completion.
 */
export async function orchestrateRollout(
  args: OrchestrateRolloutArgs,
): Promise<{ rollout: apphosting.Rollout; build: apphosting.Build }> {
  const { projectId, location, backendId, buildInput, isFirstRollout } = args;

  const buildId = await apphosting.getNextRolloutId(
    projectId,
    location,
    backendId,
    isFirstRollout ? 1 : undefined,
  );
  const buildOp = await apphosting.createBuild(projectId, location, backendId, buildId, buildInput);

  const rolloutBody = {
    build: `projects/${projectId}/locations/${location}/backends/${backendId}/builds/${buildId}`,
  };

  let tries = 0;
  let done = false;
  while (!done) {
    tries++;
    try {
      const validateOnly = true;
      await apphosting.createRollout(
        projectId,
        location,
        backendId,
        buildId,
        rolloutBody,
        validateOnly,
      );
      done = true;
    } catch (err: unknown) {
      if (err instanceof FirebaseError && err.status === 400) {
        if (tries >= 5) {
          throw err;
        }
        await sleep(1000);
      } else {
        throw err;
      }
    }
  }

  const rolloutOp = await apphosting.createRollout(
    projectId,
    location,
    backendId,
    buildId,
    rolloutBody,
  );

  const rolloutPoll = poller.pollOperation<apphosting.Rollout>({
    ...apphostingPollerOptions,
    pollerName: `create-${projectId}-${location}-backend-${backendId}-rollout-${buildId}`,
    operationResourceName: rolloutOp.name,
  });
  const buildPoll = poller.pollOperation<apphosting.Build>({
    ...apphostingPollerOptions,
    pollerName: `create-${projectId}-${location}-backend-${backendId}-build-${buildId}`,
    operationResourceName: buildOp.name,
  });

  const [rollout, build] = await Promise.all([rolloutPoll, buildPoll]);

  if (build.state !== "READY") {
    if (!build.buildLogsUri) {
      throw new FirebaseError(
        "Failed to build your app, but failed to get build logs as well. " +
          "This is an internal error and should be reported",
      );
    }
    throw new FirebaseError(
      `Failed to build your app. Please inspect the build logs at ${build.buildLogsUri}.`,
      { children: [build.error] },
    );
  }
  return { rollout, build };
}
