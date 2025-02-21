import * as devconnect from "../../gcp/devConnect";
import * as sinon from "sinon";
import * as githubConnectionsUtils from "./utils";
import { expect } from "chai";
import {
  completeConnection,
  completedOperation,
  mockConn,
  mockRepo,
  mockRepos,
  pendingConnection,
} from "./test-utils";
import { projectId, location } from "./test-utils";
import { FirebaseError } from "../../error";
import * as poller from "../../operation-poller";
import * as prompt from "../../prompt";

describe("utils", () => {
  describe("generateRepositoryId", () => {
    it("extracts repo from URI", () => {
      const cloneUri = "https://github.com/user/repo.git";
      const repoSlug = githubConnectionsUtils.generateRepositoryId(cloneUri);
      expect(repoSlug).to.equal("user-repo");
    });
  });

  describe("github connections", () => {
    const sandbox: sinon.SinonSandbox = sinon.createSandbox();

    let promptOnceStub: sinon.SinonStub;
    let getConnectionStub: sinon.SinonStub;
    let createConnectionStub: sinon.SinonStub;
    let pollOperationStub: sinon.SinonStub;
    let listAllLinkableGitRepositoriesStub: sinon.SinonStub;
    let getRepositoryStub: sinon.SinonStub;
    let createRepositoryStub: sinon.SinonStub;

    const connectionId = `apphosting-${location}`;

    beforeEach(() => {
      promptOnceStub = sandbox.stub(prompt, "promptOnce").throws("Unexpected promptOnce call");
      getConnectionStub = sandbox
        .stub(devconnect, "getConnection")
        .throws("Unexpected getConnection call");
      createConnectionStub = sandbox
        .stub(devconnect, "createConnection")
        .throws("Unexpected createConnection call");
      pollOperationStub = sandbox
        .stub(poller, "pollOperation")
        .throws("Unexpected pollOperation call");
      getRepositoryStub = sandbox
        .stub(devconnect, "getGitRepositoryLink")
        .throws("Unexpected getGitRepositoryLink call");
      createRepositoryStub = sandbox
        .stub(devconnect, "createGitRepositoryLink")
        .throws("Unexpected createGitRepositoryLink call");
      listAllLinkableGitRepositoriesStub = sandbox
        .stub(devconnect, "listAllLinkableGitRepositories")
        .throws("Unexpected listAllLinkableGitRepositories call");
    });

    afterEach(() => {
      sandbox.verifyAndRestore();
    });

    describe("parseConnectionName", () => {
      it("should parse valid connection name", () => {
        const connectionName = "projects/my-project/locations/us-central1/connections/my-conn";

        const expected = {
          projectId: "my-project",
          location: "us-central1",
          id: "my-conn",
        };

        expect(githubConnectionsUtils.parseConnectionName(connectionName)).to.deep.equal(expected);
      });

      it("should return undefined for invalid", () => {
        expect(
          githubConnectionsUtils.parseConnectionName(
            "projects/my-project/locations/us-central1/connections/my-conn/repositories/repo",
          ),
        ).to.be.undefined;
        expect(githubConnectionsUtils.parseConnectionName("foobar")).to.be.undefined;
      });
    });

    describe("listValidInstallations", () => {
      const sandbox: sinon.SinonSandbox = sinon.createSandbox();
      let fetchGitHubInstallationsStub: sinon.SinonStub;

      beforeEach(() => {
        fetchGitHubInstallationsStub = sandbox
          .stub(devconnect, "fetchGitHubInstallations")
          .throws("Unexpected fetchGitHubInstallations call");
      });

      afterEach(() => {
        sandbox.verifyAndRestore();
      });

      it("only lists organizations and authorizer github account", async () => {
        const conn = mockConn("1");
        conn.githubConfig = {
          authorizerCredential: {
            oauthTokenSecretVersion: "blah",
            username: "main-user",
          },
        };

        fetchGitHubInstallationsStub.resolves([
          {
            id: "1",
            name: "main-user",
            type: "user",
          },
          {
            id: "2",
            name: "org-1",
            type: "organization",
          },
          {
            id: "3",
            name: "org-3",
            type: "organization",
          },
          {
            id: "4",
            name: "some-other-user",
            type: "user",
          },
          {
            id: "5",
            name: "org-4",
            type: "organization",
          },
        ]);

        const installations = await githubConnectionsUtils.listValidInstallations(
          projectId,
          location,
          conn,
        );
        expect(installations).to.deep.equal([
          {
            id: "1",
            name: "main-user",
            type: "user",
          },
          {
            id: "2",
            name: "org-1",
            type: "organization",
          },
          {
            id: "3",
            name: "org-3",
            type: "organization",
          },
          {
            id: "5",
            name: "org-4",
            type: "organization",
          },
        ]);
      });
    });

    describe("getOrCreateConnection", () => {
      it("creates a connection if it doesn't exist", async () => {
        getConnectionStub.onFirstCall().rejects(new FirebaseError("error", { status: 404 }));
        getConnectionStub.onSecondCall().resolves(completedOperation(connectionId));
        createConnectionStub.resolves(completedOperation(connectionId));
        pollOperationStub.resolves(pendingConnection(connectionId));
        promptOnceStub.onFirstCall().resolves("any key");

        await githubConnectionsUtils.getOrCreateConnection(projectId, location, connectionId);
        expect(createConnectionStub).to.be.calledWith(projectId, location, connectionId);
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
          .stub(devconnect, "listAllConnections")
          .throws("Unexpected listAllConnections call");
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

        const conns = await githubConnectionsUtils.listAppHostingConnections(projectId, location);
        expect(conns).to.have.length(2);
        expect(conns.map((c) => extractId(c.name))).to.include.members([
          "apphosting-github-conn-baddcafe",
          "apphosting-github-conn-deadbeef",
        ]);
      });
    });

    describe("getConnectionForInstallation", () => {
      const sandbox: sinon.SinonSandbox = sinon.createSandbox();
      let listConnectionsStub: sinon.SinonStub;

      beforeEach(() => {
        listConnectionsStub = sandbox
          .stub(devconnect, "listAllConnections")
          .throws("Unexpected listAllConnections call");
      });

      afterEach(() => {
        sandbox.verifyAndRestore();
      });

      it("finds the matching connection for a given installation", async () => {
        const mockConn1 = mockConn("apphosting-github-conn-1");
        const mockConn2 = mockConn("apphosting-github-conn-2");
        const mockConn3 = mockConn("apphosting-github-conn-3");
        const mockConn4 = mockConn("random-conn");

        const installationToMatch = "installation-1";

        mockConn1.githubConfig = {
          appInstallationId: installationToMatch,
        };

        mockConn2.githubConfig = {
          appInstallationId: "installation-2",
        };

        mockConn3.githubConfig = {
          appInstallationId: "installation-3",
        };

        listConnectionsStub.resolves([mockConn1, mockConn2, mockConn3, mockConn4]);

        const matchingConnection = await githubConnectionsUtils.getConnectionForInstallation(
          projectId,
          location,
          installationToMatch,
        );
        expect(matchingConnection).to.deep.equal(mockConn1);
      });

      it("returns null if there is no matching connection for a given installation", async () => {
        const mockConn1 = mockConn("apphosting-github-conn-1");
        const mockConn2 = mockConn("apphosting-github-conn-2");

        const installationToMatch = "random-installation";

        mockConn1.githubConfig = {
          appInstallationId: "installation-1",
        };

        mockConn2.githubConfig = {
          appInstallationId: "installation-2",
        };

        listConnectionsStub.resolves([mockConn1, mockConn2]);

        const matchingConnection = await githubConnectionsUtils.getConnectionForInstallation(
          projectId,
          location,
          installationToMatch,
        );
        expect(matchingConnection).to.be.null;
      });
    });

    describe("getOrCreateRepository", () => {
      it("creates repository if it doesn't exist", async () => {
        getConnectionStub.resolves(completeConnection(connectionId));
        listAllLinkableGitRepositoriesStub.resolves(mockRepos.repositories);
        promptOnceStub.onFirstCall().resolves(mockRepos.repositories[0].remoteUri);
        getRepositoryStub.rejects(new FirebaseError("error", { status: 404 }));
        createRepositoryStub.resolves({ name: "op" });
        pollOperationStub.resolves(mockRepos.repositories[0]);

        await githubConnectionsUtils.getOrCreateRepository(
          projectId,
          location,
          connectionId,
          mockRepos.repositories[0].remoteUri,
        );
        expect(createRepositoryStub).to.be.calledWith(
          projectId,
          location,
          connectionId,
          "test-repo0",
          mockRepos.repositories[0].remoteUri,
        );
      });
    });
  });
});
