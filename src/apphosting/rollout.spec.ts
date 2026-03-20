import * as sinon from "sinon";
import { expect } from "chai";
import { createRollout, orchestrateRollout } from "./rollout";
import * as devConnect from "../gcp/devConnect";
import * as githubConnections from "../apphosting/githubConnections";
import * as apphosting from "../gcp/apphosting";
import * as backend from "./backend";
import { FirebaseError } from "../error";
import * as poller from "../operation-poller";
import * as utils from "../utils";

describe("apphosting rollouts", () => {
  const user = "user";
  const repo = "repo";
  const commitSha = "0123456";
  const branchId = "main";

  const projectId = "projectId";
  const location = "us-central1";
  const backendId = "backendId";
  const connectionId = "apphosting-github-conn-a1b2c3";
  const gitRepoLinkId = `${user}-${repo}`;
  const buildAndRolloutId = "build-2024-10-01-001";

  let getBackend: sinon.SinonStub;
  let getRepoDetailsFromBackendStub: sinon.SinonStub;
  let listAllBranchesStub: sinon.SinonStub;
  let getGitHubBranchStub: sinon.SinonStub;
  let getGitHubCommitStub: sinon.SinonStub;
  let getNextRolloutIdStub: sinon.SinonStub;
  let createBuildStub: sinon.SinonStub;
  let createRolloutStub: sinon.SinonStub;
  let pollOperationStub: sinon.SinonStub;
  let promptGitHubBranchStub: sinon.SinonStub;
  let sleepStub: sinon.SinonStub;

  beforeEach(() => {
    getBackend = sinon.stub(backend, "getBackend").throws("unexpected getBackend call");
    getRepoDetailsFromBackendStub = sinon
      .stub(devConnect, "getRepoDetailsFromBackend")
      .throws("unexpected getRepoDetailsFromBackend call");
    listAllBranchesStub = sinon
      .stub(devConnect, "listAllBranches")
      .throws("unexpected listAllBranches call");
    getGitHubBranchStub = sinon
      .stub(githubConnections, "getGitHubBranch")
      .throws("unexpected getGitHubBranch call");
    getGitHubCommitStub = sinon
      .stub(githubConnections, "getGitHubCommit")
      .throws("unexpected getGitHubCommit call");
    getNextRolloutIdStub = sinon
      .stub(apphosting, "getNextRolloutId")
      .throws("unexpected getNextRolloutId call");
    createBuildStub = sinon.stub(apphosting, "createBuild").throws("unexpected createBuild call");
    createRolloutStub = sinon
      .stub(apphosting, "createRollout")
      .throws("unexpected createRollout call");
    pollOperationStub = sinon.stub(poller, "pollOperation").throws("unexpected pollOperation call");
    promptGitHubBranchStub = sinon
      .stub(githubConnections, "promptGitHubBranch")
      .throws("unexpected promptGitHubBranch call");
    sleepStub = sinon.stub(utils, "sleep").throws("unexpected sleep call");
  });

  afterEach(() => {
    sinon.verifyAndRestore();
  });

  describe("apphosting rollouts", () => {
    const repoLinkId = `projects/${projectId}/location/${location}/connections/${connectionId}/gitRepositoryLinks/${gitRepoLinkId}`;

    const backend = {
      name: `projects/${projectId}/locations/${location}/backends/${backendId}`,
      labels: {},
      createTime: "0",
      updateTime: "1",
      uri: "https://placeholder.com",
      codebase: {
        repository: repoLinkId,
        rootDirectory: "/",
      },
    };

    const buildInput = {
      source: {
        codebase: {
          commit: commitSha,
        },
      },
    };

    const repoLinkDetails = {
      repoLink: {
        name: repoLinkId,
        cloneUri: `https://github.com/${user}/${repo}.git`,
        createTime: "create-time",
        updateTime: "update-time",
        reconciling: true,
        uid: "00000000",
      },
      owner: user,
      repo: repo,
      readToken: {
        token: "read-token",
        expirationTime: "some-time",
        gitUsername: user,
      },
    };

    const branches = new Set();
    branches.add(branchId);

    const commitInfo = {
      sha: commitSha,
      commit: {
        message: "new commit",
      },
    };

    const branchInfo = {
      commit: commitInfo,
    };

    const buildOp = {
      name: "build-op",
      done: true,
    };

    const rolloutOp = {
      name: "rollout-op",
      done: true,
    };

    const build = {
      name: buildAndRolloutId,
      state: "READY",
    };

    const rollout = {
      name: buildAndRolloutId,
      state: "READY",
    };

    describe("createRollout", () => {
      it("should create a new rollout from user-specified branch", async () => {
        getBackend.resolves(backend);
        getRepoDetailsFromBackendStub.resolves(repoLinkDetails);
        listAllBranchesStub.resolves(branches);
        getGitHubBranchStub.resolves(branchInfo);
        getNextRolloutIdStub.resolves(buildAndRolloutId);
        createBuildStub.resolves(buildOp);
        createRolloutStub.resolves(rolloutOp);
        pollOperationStub.onFirstCall().resolves(rollout);
        pollOperationStub.onSecondCall().resolves(build);

        await createRollout(backendId, projectId, branchId, undefined, true);

        expect(createBuildStub).to.be.called;
        expect(createRolloutStub).to.be.called;
        expect(pollOperationStub).to.be.called;
      });

      it("should create a new rollout from user-specified commit", async () => {
        getBackend.resolves(backend);
        getRepoDetailsFromBackendStub.resolves(repoLinkDetails);
        getGitHubCommitStub.resolves(commitInfo);
        getNextRolloutIdStub.resolves(buildAndRolloutId);
        createBuildStub.resolves(buildOp);
        createRolloutStub.resolves(rolloutOp);
        pollOperationStub.onFirstCall().resolves(rollout);
        pollOperationStub.onSecondCall().resolves(build);

        await createRollout(backendId, projectId, undefined, commitSha, true);

        expect(createBuildStub).to.be.called;
        expect(createRolloutStub).to.be.called;
        expect(pollOperationStub).to.be.called;
      });

      it("should prompt user for a branch if branch or commit ID is not specified", async () => {
        getBackend.resolves(backend);
        getRepoDetailsFromBackendStub.resolves(repoLinkDetails);
        promptGitHubBranchStub.resolves(branchId);
        getGitHubBranchStub.resolves(branchInfo);
        getNextRolloutIdStub.resolves(buildAndRolloutId);
        createBuildStub.resolves(buildOp);
        createRolloutStub.resolves(rolloutOp);
        pollOperationStub.onFirstCall().resolves(rollout);
        pollOperationStub.onSecondCall().resolves(build);

        await createRollout(backendId, projectId, undefined, undefined, false);

        expect(promptGitHubBranchStub).to.be.called;
        expect(createBuildStub).to.be.called;
        expect(createRolloutStub).to.be.called;
        expect(pollOperationStub).to.be.called;
      });

      it("should throw an error if GitHub branch is not found", async () => {
        getBackend.resolves(backend);
        getRepoDetailsFromBackendStub.resolves(repoLinkDetails);
        listAllBranchesStub.resolves(branches);

        await expect(
          createRollout(backendId, projectId, "invalid-branch", undefined, true),
        ).to.be.rejectedWith(/Unrecognized git branch/);
      });

      it("should throw an error if GitHub commit is not found", async () => {
        getBackend.resolves(backend);
        getRepoDetailsFromBackendStub.resolves(repoLinkDetails);
        getGitHubCommitStub.rejects(new FirebaseError("error", { status: 422 }));

        await expect(
          createRollout(backendId, projectId, undefined, commitSha, true),
        ).to.be.rejectedWith(/Unrecognized git commit/);
      });

      it("should throw an error if --force flag is specified but --git-branch and --git-commit are missing", async () => {
        getBackend.resolves(backend);
        getRepoDetailsFromBackendStub.resolves(repoLinkDetails);

        await expect(
          createRollout(backendId, projectId, undefined, undefined, true),
        ).to.be.rejectedWith(/Failed to create rollout with --force option/);
      });
    });

    describe("orchestrateRollout", () => {
      it("should successfully create build and rollout", async () => {
        getNextRolloutIdStub.resolves(buildAndRolloutId);
        createBuildStub.resolves(buildOp);
        createRolloutStub.resolves(rolloutOp);
        pollOperationStub.onFirstCall().resolves(rollout);
        pollOperationStub.onSecondCall().resolves(build);
        sleepStub.resolves();

        await orchestrateRollout({
          projectId,
          location,
          backendId,
          buildInput,
        });

        expect(createBuildStub).to.be.called;
        expect(createRolloutStub).to.be.called;
      });

      it("should retry createRollout call on HTTP 400 errors", async () => {
        getNextRolloutIdStub.resolves(buildAndRolloutId);
        createBuildStub.resolves(buildOp);
        createRolloutStub.onFirstCall().rejects(new FirebaseError("error", { status: 400 }));
        createRolloutStub.resolves(rolloutOp);
        pollOperationStub.onFirstCall().resolves(rollout);
        pollOperationStub.onSecondCall().resolves(build);
        sleepStub.resolves();

        await orchestrateRollout({
          projectId,
          location,
          backendId,
          buildInput,
        });

        expect(createBuildStub).to.be.called;
        expect(createRolloutStub).to.be.calledThrice;
        expect(pollOperationStub).to.be.called;
      });
    });
  });
});
