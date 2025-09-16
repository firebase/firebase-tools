"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.orchestrateRollout = exports.createRollout = void 0;
const apphosting = require("../gcp/apphosting");
const error_1 = require("../error");
const ora = require("ora");
const devConnect_1 = require("../gcp/devConnect");
const githubConnections_1 = require("../apphosting/githubConnections");
const poller = require("../operation-poller");
const utils_1 = require("../utils");
const api_1 = require("../api");
const backend_1 = require("./backend");
const apphostingPollerOptions = {
    apiOrigin: (0, api_1.apphostingOrigin)(),
    apiVersion: apphosting.API_VERSION,
    masterTimeout: 25 * 60 * 1000,
    maxBackoff: 10000,
};
const GIT_COMMIT_SHA_REGEX = /^(?:[0-9a-f]{40}|[0-9a-f]{7})$/;
/**
 * Create a new App Hosting rollout for a backend.
 * Implements core logic for apphosting:rollouts:create command.
 */
async function createRollout(backendId, projectId, branch, commit, force) {
    const backend = await (0, backend_1.getBackend)(projectId, backendId);
    if (!backend.codebase || !backend.codebase.repository) {
        throw new error_1.FirebaseError(`Backend ${backendId} is missing a connected repository. If you would like to deploy from a branch or commit of a GitHub repository, you can connect one through the Firebase Console. If you would like to deploy from local source, run 'firebase deploy'.`);
    }
    const { location } = apphosting.parseBackendName(backend.name);
    const { repoLink, owner, repo, readToken } = await (0, devConnect_1.getRepoDetailsFromBackend)(projectId, location, backend.codebase.repository);
    let targetCommit;
    if (branch) {
        const branches = await (0, devConnect_1.listAllBranches)(repoLink.name);
        if (!branches.has(branch)) {
            throw new error_1.FirebaseError(`Unrecognized git branch ${branch}. Please double-check your branch name and try again.`);
        }
        const branchInfo = await (0, githubConnections_1.getGitHubBranch)(owner, repo, branch, readToken.token);
        targetCommit = branchInfo.commit;
    }
    else if (commit) {
        if (!GIT_COMMIT_SHA_REGEX.test(commit)) {
            throw new error_1.FirebaseError(`Invalid git commit ${commit}. Must be a valid SHA1 hash.`);
        }
        try {
            const commitInfo = await (0, githubConnections_1.getGitHubCommit)(owner, repo, commit, readToken.token);
            targetCommit = commitInfo;
        }
        catch (err) {
            // 422 HTTP status code returned by GitHub indicates it was unable to find the commit.
            if (err.status === 422) {
                throw new error_1.FirebaseError(`Unrecognized git commit ${commit}. Please double-check your commit hash and try again.`);
            }
            throw err;
        }
    }
    else {
        if (force) {
            throw new error_1.FirebaseError(`Failed to create rollout with --force option because no target branch or commit was specified. Please specify which branch or commit to roll out with the --git-branch or --git-commit flag.`);
        }
        branch = await (0, githubConnections_1.promptGitHubBranch)(repoLink);
        const branchInfo = await (0, githubConnections_1.getGitHubBranch)(owner, repo, branch, readToken.token);
        targetCommit = branchInfo.commit;
    }
    (0, utils_1.logBullet)(`You are about to deploy [${targetCommit.sha.substring(0, 7)}]: ${targetCommit.commit.message}`);
    (0, utils_1.logBullet)(`You may also track this rollout at:\n\t${(0, api_1.consoleOrigin)()}/project/${projectId}/apphosting`);
    const createRolloutSpinner = ora("Starting a new rollout; this may take a few minutes. It's safe to exit now.").start();
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
    }
    catch (err) {
        createRolloutSpinner.fail("Rollout failed.");
        throw err;
    }
    createRolloutSpinner.succeed("Successfully created a new rollout!");
}
exports.createRollout = createRollout;
/**
 * Creates a new build and rollout and polls both to completion.
 */
async function orchestrateRollout(args) {
    const { projectId, location, backendId, buildInput, isFirstRollout } = args;
    const buildId = await apphosting.getNextRolloutId(projectId, location, backendId, isFirstRollout ? 1 : undefined);
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
            await apphosting.createRollout(projectId, location, backendId, buildId, rolloutBody, validateOnly);
            done = true;
        }
        catch (err) {
            if (err instanceof error_1.FirebaseError && err.status === 400) {
                if (tries >= 5) {
                    throw err;
                }
                await (0, utils_1.sleep)(1000);
            }
            else {
                throw err;
            }
        }
    }
    const rolloutOp = await apphosting.createRollout(projectId, location, backendId, buildId, rolloutBody);
    const rolloutPoll = poller.pollOperation(Object.assign(Object.assign({}, apphostingPollerOptions), { pollerName: `create-${projectId}-${location}-backend-${backendId}-rollout-${buildId}`, operationResourceName: rolloutOp.name }));
    const buildPoll = poller.pollOperation(Object.assign(Object.assign({}, apphostingPollerOptions), { pollerName: `create-${projectId}-${location}-backend-${backendId}-build-${buildId}`, operationResourceName: buildOp.name }));
    const [rollout, build] = await Promise.all([rolloutPoll, buildPoll]);
    if (build.state !== "READY") {
        if (!build.buildLogsUri) {
            throw new error_1.FirebaseError("Failed to build your app, but failed to get build logs as well. " +
                "This is an internal error and should be reported");
        }
        throw new error_1.FirebaseError(`Failed to build your app. Please inspect the build logs at ${build.buildLogsUri}.`, { children: [build.error] });
    }
    return { rollout, build };
}
exports.orchestrateRollout = orchestrateRollout;
