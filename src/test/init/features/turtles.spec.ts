import * as sinon from "sinon";
import { expect } from "chai";

import * as gcb from "../../../gcp/cloudbuild";
import * as prompt from "../../../prompt";
import * as poller from "../../../operation-poller";
import { FirebaseError } from "../../../error";
import * as repo from "../../../init/features/turtles/repo";

describe("turtles", () => {
  const sandbox: sinon.SinonSandbox = sinon.createSandbox();

  let promptOnceStub: sinon.SinonStub;
  let pollOperationStub: sinon.SinonStub;
  let getConnectionStub: sinon.SinonStub;
  let getRepositoryStub: sinon.SinonStub;
  let createConnectionStub: sinon.SinonStub;
  let createRepositoryStub: sinon.SinonStub;
  let fetchLinkableRepositoriesStub: sinon.SinonStub;

  beforeEach(() => {
    promptOnceStub = sandbox.stub(prompt, "promptOnce").throws("Unexpected promptOnce call");
    pollOperationStub = sandbox
      .stub(poller, "pollOperation")
      .throws("Unexpected pollOperation call");
    getConnectionStub = sandbox.stub(gcb, "getConnection").throws("Unexpected getConnection call");
    getRepositoryStub = sandbox.stub(gcb, "getRepository").throws("Unexpected getRepository call");
    createConnectionStub = sandbox
      .stub(gcb, "createConnection")
      .throws("Unexpected createConnection call");
    createRepositoryStub = sandbox
      .stub(gcb, "createRepository")
      .throws("Unexpected createRepository call");
    fetchLinkableRepositoriesStub = sandbox
      .stub(gcb, "fetchLinkableRepositories")
      .throws("Unexpected fetchLinkableRepositories call");

    // sandbox.stub(repo, "openInBrowser").resolves();
  });

  afterEach(() => {
    sandbox.verifyAndRestore();
  });

  describe("connect GitHub repo", () => {
    const projectId = "projectId";
    const location = "us-central1";
    const stackId = "stack0";
    const connectionId = `turtles-${stackId}-conn`;

    const op = {
      name: `projects/${projectId}/locations/${location}/connections/${connectionId}`,
      done: true,
    };
    const pendingConn = {
      name: `projects/${projectId}/locations/${location}/connections/${connectionId}`,
      disabled: false,
      createTime: "0",
      updateTime: "1",
      installationState: {
        stage: "PENDING_USER_OAUTH",
        message: "pending",
        actionUri: "https://google.com",
      },
      reconciling: false,
    };
    const completeConn = {
      name: `projects/${projectId}/locations/${location}/connections/${connectionId}`,
      disabled: false,
      createTime: "0",
      updateTime: "1",
      installationState: {
        stage: "COMPLETE",
        message: "complete",
        actionUri: "https://google.com",
      },
      reconciling: false,
    };
    const repos = {
      repositories: [
        {
          name: "repo0",
          remoteUri: "https://github.com/test/repo0.git",
        },
        {
          name: "repo1",
          remoteUri: "https://github.com/test/repo1.git",
        },
      ],
    };

    it.only("creates a connection if it doesn't exist", async () => {
      getConnectionStub.onFirstCall().rejects(new FirebaseError("error", { status: 404 }));
      getConnectionStub.onSecondCall().resolves(completeConn);
      fetchLinkableRepositoriesStub.resolves(repos);
      createConnectionStub.resolves(op);
      pollOperationStub.resolves(pendingConn);
      promptOnceStub.onFirstCall().resolves("continue");
      promptOnceStub.onSecondCall().resolves(repos.repositories[0].remoteUri);
      getRepositoryStub.resolves(repos.repositories[0]);

      await repo.linkGitHubRepository(projectId, location, stackId);
      expect(createConnectionStub).to.be.calledWith(projectId, location, connectionId);
    });

    it("create repository if it doesn't exist", async () => {
      getConnectionStub.resolves(completeConn);
      fetchLinkableRepositoriesStub.resolves(repos);
      promptOnceStub.onFirstCall().resolves(repos.repositories[0].remoteUri);
      getRepositoryStub.rejects(new FirebaseError("error", { status: 404 }));
      createRepositoryStub.resolves();
      pollOperationStub.resolves(repos.repositories[0]);

      await repo.linkGitHubRepository(projectId, location, stackId);
      expect(createRepositoryStub).to.be.calledWith(
        projectId,
        location,
        connectionId,
        "test--repo0",
        repos.repositories[0].remoteUri
      );
    });

    it("throws error if user fails to auth github connection", async () => {
      getConnectionStub.resolves(pendingConn);

      promptOnceStub.onFirstCall().resolves("continue");
      promptOnceStub.onSecondCall().resolves("cancel");

      await expect(repo.linkGitHubRepository(projectId, location, stackId)).to.be.rejected;
      expect(promptOnceStub).to.be.calledTwice;
    });

    it.only("throws error if no linkable repositories are available", async () => {
      getConnectionStub.resolves(pendingConn);
      fetchLinkableRepositoriesStub.resolves({ repositories: [] });

      await expect(repo.linkGitHubRepository(projectId, location, stackId)).to.be.rejected;
    });
  });
});
