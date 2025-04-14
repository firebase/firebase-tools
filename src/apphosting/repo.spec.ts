import * as sinon from "sinon";
import { expect } from "chai";

import * as gcb from "../gcp/cloudbuild";
import * as rm from "../gcp/resourceManager";
import * as prompt from "../prompt";
import * as poller from "../operation-poller";
import * as repo from "./repo";
import * as utils from "../utils";
import * as srcUtils from "../getProjectNumber";
import { FirebaseError } from "../error";

const projectId = "projectId";
const location = "us-central1";

function mockConn(id: string): gcb.Connection {
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

function mockRepo(name: string): gcb.Repository {
  return {
    name: `${name}`,
    remoteUri: `https://github.com/test/${name}.git`,
    createTime: "",
    updateTime: "",
  };
}

function mockReposWithRandomUris(n: number): gcb.Repository[] {
  const repos = [];
  for (let i = 0; i < n; i++) {
    const hash = Math.random().toString(36).slice(6);
    repos.push(mockRepo(hash));
  }
  return repos;
}

describe("composer", () => {
  describe("connect GitHub repo", () => {
    const sandbox: sinon.SinonSandbox = sinon.createSandbox();

    let promptOnceStub: sinon.SinonStub;
    let pollOperationStub: sinon.SinonStub;
    let getConnectionStub: sinon.SinonStub;
    let getRepositoryStub: sinon.SinonStub;
    let createConnectionStub: sinon.SinonStub;
    let serviceAccountHasRolesStub: sinon.SinonStub;
    let createRepositoryStub: sinon.SinonStub;
    let fetchLinkableRepositoriesStub: sinon.SinonStub;
    let getProjectNumberStub: sinon.SinonStub;
    let openInBrowserPopupStub: sinon.SinonStub;

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
      serviceAccountHasRolesStub = sandbox.stub(rm, "serviceAccountHasRoles").resolves(true);
      createRepositoryStub = sandbox
        .stub(gcb, "createRepository")
        .throws("Unexpected createRepository call");
      fetchLinkableRepositoriesStub = sandbox
        .stub(gcb, "fetchLinkableRepositories")
        .throws("Unexpected fetchLinkableRepositories call");
      sandbox.stub(utils, "openInBrowser").resolves();
      openInBrowserPopupStub = sandbox
        .stub(utils, "openInBrowserPopup")
        .throws("Unexpected openInBrowserPopup call");
      getProjectNumberStub = sandbox
        .stub(srcUtils, "getProjectNumber")
        .throws("Unexpected getProjectNumber call");
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

    it("checks if secret manager admin role is granted for cloud build P4SA when creating an oauth connection", async () => {
      getConnectionStub.onFirstCall().rejects(new FirebaseError("error", { status: 404 }));
      getConnectionStub.onSecondCall().resolves(completeConn);
      createConnectionStub.resolves(op);
      pollOperationStub.resolves(pendingConn);
      promptOnceStub.resolves("any key");
      getProjectNumberStub.onFirstCall().resolves(projectId);
      openInBrowserPopupStub.resolves({ url: "", cleanup: sandbox.stub() });

      await repo.getOrCreateOauthConnection(projectId, location);
      expect(serviceAccountHasRolesStub).to.be.calledWith(
        projectId,
        `service-${projectId}@gcp-sa-cloudbuild.iam.gserviceaccount.com`,
        ["roles/secretmanager.admin"],
        true,
      );
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

  describe("fetchAllRepositories", () => {
    const sandbox: sinon.SinonSandbox = sinon.createSandbox();
    let fetchLinkableRepositoriesStub: sinon.SinonStub;

    beforeEach(() => {
      fetchLinkableRepositoriesStub = sandbox
        .stub(gcb, "fetchLinkableRepositories")
        .throws("Unexpected fetchLinkableRepositories call");
    });

    afterEach(() => {
      sandbox.verifyAndRestore();
    });

    it("should fetch all repositories from multiple pages", async () => {
      fetchLinkableRepositoriesStub.onFirstCall().resolves({
        repositories: mockReposWithRandomUris(10),
        nextPageToken: "1234",
      });
      fetchLinkableRepositoriesStub.onSecondCall().resolves({
        repositories: mockReposWithRandomUris(10),
      });

      const { repos, remoteUriToConnection } = await repo.fetchAllRepositories(projectId, [
        mockConn("conn0"),
      ]);

      expect(repos.length).to.equal(20);
      expect(Object.keys(remoteUriToConnection).length).to.equal(20);
    });

    it("should fetch all linkable repositories from multiple connections", async () => {
      const conn0 = mockConn("conn0");
      const conn1 = mockConn("conn1");
      const repo0 = mockRepo("repo-0");
      const repo1 = mockRepo("repo-1");
      fetchLinkableRepositoriesStub.onFirstCall().resolves({
        repositories: [repo0],
      });
      fetchLinkableRepositoriesStub.onSecondCall().resolves({
        repositories: [repo1],
      });

      const { repos, remoteUriToConnection } = await repo.fetchAllRepositories(projectId, [
        conn0,
        conn1,
      ]);

      expect(repos.length).to.equal(2);
      expect(remoteUriToConnection).to.deep.equal({
        [repo0.remoteUri]: conn0,
        [repo1.remoteUri]: conn1,
      });
    });
  });

  describe("listAppHostingConnections", () => {
    const sandbox: sinon.SinonSandbox = sinon.createSandbox();
    let listConnectionsStub: sinon.SinonStub;

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
