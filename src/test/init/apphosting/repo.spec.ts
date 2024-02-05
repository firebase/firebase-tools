import * as sinon from "sinon";
import { expect } from "chai";

import * as gcb from "../../../gcp/cloudbuild";
import * as prompt from "../../../prompt";
import * as poller from "../../../operation-poller";
import * as repo from "../../../init/features/apphosting/repo";
import * as utils from "../../../utils";
import { Connection } from "../../../gcp/cloudbuild";
import { FirebaseError } from "../../../error";

describe("composer", () => {
  describe("connect GitHub repo", () => {
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
      getConnectionStub = sandbox
        .stub(gcb, "getConnection")
        .throws("Unexpected getConnection call");
      getRepositoryStub = sandbox
        .stub(gcb, "getRepository")
        .throws("Unexpected getRepository call");
      createConnectionStub = sandbox
        .stub(gcb, "createConnection")
        .throws("Unexpected createConnection call");
      createRepositoryStub = sandbox
        .stub(gcb, "createRepository")
        .throws("Unexpected createRepository call");
      fetchLinkableRepositoriesStub = sandbox
        .stub(gcb, "fetchLinkableRepositories")
        .throws("Unexpected fetchLinkableRepositories call");

      sandbox.stub(utils, "openInBrowser").resolves();
    });

    afterEach(() => {
      sandbox.verifyAndRestore();
    });

    const projectId = "projectId";
    const location = "us-central1";
    const connectionId = `apphosting-${location}`;

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

    it("creates a connection if it doesn't exist", async () => {
      getConnectionStub.onFirstCall().rejects(new FirebaseError("error", { status: 404 }));
      getConnectionStub.onSecondCall().resolves(completeConn);
      createConnectionStub.resolves(op);
      pollOperationStub.resolves(pendingConn);
      promptOnceStub.onFirstCall().resolves("any key");

      await repo.getOrCreateConnection(projectId, location, connectionId);
      expect(createConnectionStub).to.be.calledWith(projectId, location, connectionId);
    });

    it("creates repository if it doesn't exist", async () => {
      getConnectionStub.resolves(completeConn);
      fetchLinkableRepositoriesStub.resolves(repos);
      promptOnceStub.onFirstCall().resolves(repos.repositories[0].remoteUri);
      getRepositoryStub.rejects(new FirebaseError("error", { status: 404 }));
      createRepositoryStub.resolves({ name: "op" });
      pollOperationStub.resolves(repos.repositories[0]);

      await repo.getOrCreateRepository(
        projectId,
        location,
        connectionId,
        repos.repositories[0].remoteUri,
      );
      expect(createRepositoryStub).to.be.calledWith(
        projectId,
        location,
        connectionId,
        "test-repo0",
        repos.repositories[0].remoteUri,
      );
    });

    it("re-uses existing repository it already exists", async () => {
      getConnectionStub.resolves(completeConn);
      fetchLinkableRepositoriesStub.resolves(repos);
      promptOnceStub.onFirstCall().resolves(repos.repositories[0].remoteUri);
      getRepositoryStub.resolves(repos.repositories[0]);

      const r = await repo.getOrCreateRepository(
        projectId,
        location,
        connectionId,
        repos.repositories[0].remoteUri,
      );
      expect(r).to.be.deep.equal(repos.repositories[0]);
    });

    it("throws error if no linkable repositories are available", async () => {
      getConnectionStub.resolves(pendingConn);
      fetchLinkableRepositoriesStub.resolves({ repositories: [] });

      await expect(repo.linkGitHubRepository(projectId, location)).to.be.rejected;
    });
  });

  describe("parseConnectionName", () => {
    it("should parse valid connection name", () => {
      const str = "projects/my-project/locations/us-central1/connections/my-conn";

      const expected = {
        projectId: "my-project",
        location: "us-central1",
        id: "my-conn",
      };

      expect(repo.parseConnectionName(str)).to.deep.equal(expected);
    });

    it("should return undefined for invalid", () => {
      expect(
        repo.parseConnectionName(
          "projects/my-project/locations/us-central1/connections/my-conn/repositories/repo",
        ),
      ).to.be.undefined;
      expect(repo.parseConnectionName("foobar")).to.be.undefined;
    });
  });

  describe("listAppHostingConnections", () => {
    const sandbox: sinon.SinonSandbox = sinon.createSandbox();
    let listConnectionsStub: sinon.SinonStub;

    const projectId = "projectId";
    const location = "us-central1";

    function mockConn(id: string): Connection {
      return {
        name: `projects/${projectId}/locations/${location}/connections/${id}`,
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
    }

    function extractId(name: string): string {
      const parts = name.split("/");
      return parts.pop() ?? "";
    }

    beforeEach(() => {
      listConnectionsStub = sandbox
        .stub(gcb, "listConnections")
        .throws("Unexpected getConnection call");
    });

    afterEach(() => {
      sandbox.verifyAndRestore();
    });

    it("filters out non-apphosting connections", async () => {
      listConnectionsStub.resolves([
        mockConn("apphosting-github-conn-baddcafe"),
        mockConn("hooray-conn"),
        mockConn("apphosting-github-conn-deadbeef"),
        mockConn("apphosting-github-oauth"),
      ]);

      const conns = await repo.listAppHostingConnections(projectId);
      expect(conns).to.have.length(2);
      expect(conns.map((c) => extractId(c.name))).to.include.members([
        "apphosting-github-conn-baddcafe",
        "apphosting-github-conn-deadbeef",
      ]);
    });
  });
});
