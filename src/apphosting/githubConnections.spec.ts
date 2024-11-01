import * as sinon from "sinon";
import { expect } from "chai";
import * as prompt from "../prompt";
import * as poller from "../operation-poller";
import * as devconnect from "../gcp/devConnect";
import * as repo from "./githubConnections";
import * as utils from "../utils";
import * as srcUtils from "../getProjectNumber";
import * as rm from "../gcp/resourceManager";
import { FirebaseError } from "../error";

const projectId = "projectId";
const location = "us-central1";

function mockConn(id: string): devconnect.Connection {
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

function mockRepo(name: string): devconnect.GitRepositoryLink {
  return {
    name: `${name}`,
    cloneUri: `https://github.com/test/${name}.git`,
    createTime: "",
    updateTime: "",
    deleteTime: "",
    reconciling: false,
    uid: "",
  };
}

describe("githubConnections", () => {
  describe("parseConnectionName", () => {
    it("should parse valid connection name", () => {
      const connectionName = "projects/my-project/locations/us-central1/connections/my-conn";

      const expected = {
        projectId: "my-project",
        location: "us-central1",
        id: "my-conn",
      };

      expect(repo.parseConnectionName(connectionName)).to.deep.equal(expected);
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

  describe("extractRepoSlugFromUri", () => {
    it("extracts repo from URI", () => {
      const cloneUri = "https://github.com/user/repo.git";
      const repoSlug = repo.extractRepoSlugFromUri(cloneUri);
      expect(repoSlug).to.equal("user/repo");
    });
  });

  describe("generateRepositoryId", () => {
    it("extracts repo from URI", () => {
      const cloneUri = "https://github.com/user/repo.git";
      const repoSlug = repo.generateRepositoryId(cloneUri);
      expect(repoSlug).to.equal("user-repo");
    });
  });

  describe("connect GitHub repo", () => {
    const sandbox: sinon.SinonSandbox = sinon.createSandbox();

    let promptOnceStub: sinon.SinonStub;
    let pollOperationStub: sinon.SinonStub;
    let getConnectionStub: sinon.SinonStub;
    let getRepositoryStub: sinon.SinonStub;
    let createConnectionStub: sinon.SinonStub;
    let serviceAccountHasRolesStub: sinon.SinonStub;
    let createRepositoryStub: sinon.SinonStub;
    let listAllLinkableGitRepositoriesStub: sinon.SinonStub;
    let getProjectNumberStub: sinon.SinonStub;
    let openInBrowserPopupStub: sinon.SinonStub;
    let listConnectionsStub: sinon.SinonStub;
    let fetchGitHubInstallationsStub: sinon.SinonStub;

    beforeEach(() => {
      promptOnceStub = sandbox.stub(prompt, "promptOnce").throws("Unexpected promptOnce call");
      pollOperationStub = sandbox
        .stub(poller, "pollOperation")
        .throws("Unexpected pollOperation call");
      getConnectionStub = sandbox
        .stub(devconnect, "getConnection")
        .throws("Unexpected getConnection call");
      getRepositoryStub = sandbox
        .stub(devconnect, "getGitRepositoryLink")
        .throws("Unexpected getGitRepositoryLink call");
      createConnectionStub = sandbox
        .stub(devconnect, "createConnection")
        .throws("Unexpected createConnection call");
      serviceAccountHasRolesStub = sandbox.stub(rm, "serviceAccountHasRoles").resolves(true);
      createRepositoryStub = sandbox
        .stub(devconnect, "createGitRepositoryLink")
        .throws("Unexpected createGitRepositoryLink call");
      listAllLinkableGitRepositoriesStub = sandbox
        .stub(devconnect, "listAllLinkableGitRepositories")
        .throws("Unexpected listAllLinkableGitRepositories call");
      sandbox.stub(utils, "openInBrowser").resolves();
      openInBrowserPopupStub = sandbox
        .stub(utils, "openInBrowserPopup")
        .throws("Unexpected openInBrowserPopup call");
      getProjectNumberStub = sandbox
        .stub(srcUtils, "getProjectNumber")
        .throws("Unexpected getProjectNumber call");
      listConnectionsStub = sandbox
        .stub(devconnect, "listAllConnections")
        .throws("Unexpected listAllConnections call");
      fetchGitHubInstallationsStub = sandbox
        .stub(devconnect, "fetchGitHubInstallations")
        .throws("Unexpected fetchGitHubInstallations call");
    });

    afterEach(() => {
      sandbox.verifyAndRestore();
    });

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

    const oauthConnectionId = `firebase-app-hosting-github-oauth`;

    const oauthConn = {
      name: `projects/${projectId}/locations/${location}/connections/${oauthConnectionId}`,
      disabled: false,
      createTime: "0",
      updateTime: "1",
      installationState: {
        stage: "COMPLETE",
        message: "complete",
        actionUri: "https://google.com",
      },
      reconciling: false,
      githubConfig: {
        githubApp: "FIREBASE",
        authorizerCredential: {
          oauthTokenSecretVersion: "1",
          username: "testUser",
        },
        appInstallationId: "installationID",
        installationUri: "http://uri",
      },
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

    it("checks if secret manager admin role is granted for developer connect P4SA when creating an oauth connection", async () => {
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
        `service-${projectId}@gcp-sa-devconnect.iam.gserviceaccount.com`,
        ["roles/secretmanager.admin"],
        true,
      );
    });

    it("creates repository if it doesn't exist", async () => {
      getConnectionStub.resolves(completeConn);
      listAllLinkableGitRepositoriesStub.resolves(repos.repositories);
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

    it("links a github repository without an existing oauth connection", async () => {
      // linkGitHubRepository()
      // -getOrCreateGithubConnectionWithSentinel()
      // --getOrCreateOauthConnection
      getConnectionStub.onFirstCall().rejects(new FirebaseError("error", { status: 404 })); // Oauth sentinel not yet created.
      createConnectionStub.onFirstCall().resolves({ name: "op" }); // Poll on createsConnection().
      pollOperationStub.onFirstCall().resolves(oauthConn); // Polling returns the connection created.
      getProjectNumberStub.onFirstCall().resolves(projectId); // Verifies the secret manager grant.

      // -getOrCreateGithubConnectionWithSentinel()
      // promptGitHubInstallation fetches the installations.
      fetchGitHubInstallationsStub.resolves([
        {
          id: "installationID",
          name: "main-user",
          type: "user",
        },
      ]);

      promptOnceStub.onFirstCall().resolves("installationID"); // Uses existing Github Account installation.
      listConnectionsStub.resolves([oauthConn]); // getConnectionForInstallation() returns sentinel connection.

      // -- createFullyInstalledConnection
      createConnectionStub.onSecondCall().resolves({ name: "op" }); // Poll on createsConnection().
      pollOperationStub.onSecondCall().resolves(pendingConn); // Polling returns the connection created.
      promptOnceStub.onSecondCall().resolves("enter"); // Enter to signal setup finished.
      getConnectionStub.onSecondCall().resolves(completeConn); // getConnection() returns a completed connection.

      // linkGitHubRepository()
      // -promptCloneUri()
      listAllLinkableGitRepositoriesStub.resolves(repos.repositories); // fetchRepositoryCloneUris() returns repos
      promptOnceStub.onThirdCall().resolves(repos.repositories[0].remoteUri); // promptCloneUri() returns repo's clone uri.

      // linkGitHubRepository()
      getConnectionStub.onThirdCall().resolves(completeConn); // getOrCreateConnection() returns a completed connection.

      // -getOrCreateRepository()
      getRepositoryStub.rejects(new FirebaseError("error", { status: 404 })); // Repo not yet created.
      createRepositoryStub.resolves({ name: "op" }); // Poll on createGitRepositoryLink().
      pollOperationStub.resolves(repos.repositories[0]); // Polling returns the gitRepoLink.

      const r = await repo.linkGitHubRepository(projectId, location);
      expect(getConnectionStub).to.be.calledWith(projectId, location, oauthConnectionId);
      expect(getConnectionStub).to.be.calledWith(projectId, location, connectionId);
      expect(createConnectionStub).to.be.calledWith(projectId, location, oauthConnectionId);
      expect(createConnectionStub).to.be.calledWithMatch(
        projectId,
        location,
        /apphosting-github-conn-.*/g,
        {
          appInstallationId: "installationID",
          authorizerCredential: oauthConn.githubConfig.authorizerCredential,
        },
      );

      expect(r).to.be.deep.equal(repos.repositories[0]); // Returns the correct repo.
    });

    it("links a github repository using a sentinel oauth connection", async () => {
      // linkGitHubRepository()
      // -getOrCreateGithubConnectionWithSentinel()
      getConnectionStub.onFirstCall().resolves(oauthConn); // getOrCreateOauthConnection() Fetches oauth sentinel.

      // promptGitHubInstallation fetches the installations.
      fetchGitHubInstallationsStub.resolves([
        {
          id: "installationID",
          name: "main-user",
          type: "user",
        },
      ]);

      promptOnceStub.onFirstCall().resolves("installationID"); // Uses existing Github Account installation.
      listConnectionsStub.resolves([oauthConn]); // getConnectionForInstallation() returns sentinel connection.
      createConnectionStub.onFirstCall().resolves({ name: "op" }); // Poll on createsConnection().
      pollOperationStub.onFirstCall().resolves(completeConn); // Polling returns the oauth stub connection created.

      // linkGitHubRepository()
      // -promptCloneUri()
      listAllLinkableGitRepositoriesStub.resolves(repos.repositories); // fetchRepositoryCloneUris() returns repos
      promptOnceStub.onSecondCall().resolves(repos.repositories[0].remoteUri); // promptCloneUri() returns repo's clone uri.

      // linkGitHubRepository()
      getConnectionStub.onSecondCall().resolves(completeConn); // getOrCreateConnection() returns a completed connection.

      // -getOrCreateRepository()
      getRepositoryStub.rejects(new FirebaseError("error", { status: 404 })); // Repo not yet created.
      createRepositoryStub.resolves({ name: "op" }); // Poll on createGitRepositoryLink().
      pollOperationStub.onSecondCall().resolves(repos.repositories[0]); // Polling returns the gitRepoLink.

      const r = await repo.linkGitHubRepository(projectId, location);
      expect(getConnectionStub).to.be.calledWith(projectId, location, oauthConnectionId);
      expect(getConnectionStub).to.be.calledWith(projectId, location, connectionId);
      expect(createConnectionStub).to.be.calledOnce;
      expect(createConnectionStub).to.be.calledWithMatch(
        projectId,
        location,
        /apphosting-github-conn-.*/g,
        {
          appInstallationId: "installationID",
          authorizerCredential: oauthConn.githubConfig.authorizerCredential,
        },
      );

      expect(r).to.be.deep.equal(repos.repositories[0]); // Returns the correct repo.
    });

    it("links a github repository with a new named connection", async () => {
      const namedConnectionId = `apphosting-named-${location}`;

      const namedCompleteConn = {
        name: `projects/${projectId}/locations/${location}/connections/${namedConnectionId}`,
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

      // linkGitHubRepository()
      // -getOrCreateGithubConnectionWithSentinel()
      getConnectionStub.onFirstCall().rejects(new FirebaseError("error", { status: 404 })); // Named connection does not exist.
      getConnectionStub.onSecondCall().resolves(oauthConn); // Fetches oauth sentinel.
      // promptGitHubInstallation fetches the installations.
      fetchGitHubInstallationsStub.resolves([
        {
          id: "installationID",
          name: "main-user",
          type: "user",
        },
      ]);
      promptOnceStub.onFirstCall().resolves("installationID"); // Uses existing Github Account installation.
      listConnectionsStub.resolves([oauthConn]); // Installation has sentinel connection but not the named one.

      // --createFullyInstalledConnection
      createConnectionStub.onFirstCall().resolves({ name: "op" }); // Poll on createsConnection().
      pollOperationStub.onFirstCall().resolves(namedCompleteConn); // Polling returns the connection created.

      // linkGitHubRepository()
      // -promptCloneUri()
      listAllLinkableGitRepositoriesStub.resolves(repos.repositories); // fetchRepositoryCloneUris() returns repos
      promptOnceStub.onSecondCall().resolves(repos.repositories[0].remoteUri); // promptCloneUri() returns repo's clone uri.

      // linkGitHubRepository()
      getConnectionStub.onThirdCall().resolves(namedCompleteConn); // getOrCreateConnection() returns a completed connection.

      // -getOrCreateRepository()
      getRepositoryStub.rejects(new FirebaseError("error", { status: 404 })); // Repo not yet created.
      createRepositoryStub.resolves({ name: "op" }); // Poll on createGitRepositoryLink().
      pollOperationStub.onSecondCall().resolves(repos.repositories[0]); // Polling returns the gitRepoLink.

      const r = await repo.linkGitHubRepository(projectId, location, namedConnectionId);

      expect(r).to.be.deep.equal(repos.repositories[0]);
      expect(getConnectionStub).to.be.calledWith(projectId, location, oauthConnectionId);
      expect(getConnectionStub).to.be.calledWith(projectId, location, namedConnectionId);
      expect(createConnectionStub).to.be.calledWith(projectId, location, namedConnectionId, {
        appInstallationId: "installationID",
        authorizerCredential: oauthConn.githubConfig.authorizerCredential,
      });
    });

    it("reuses an existing named connection to link github repo", async () => {
      const namedConnectionId = `apphosting-named-${location}`;

      const namedCompleteConn = {
        name: `projects/${projectId}/locations/${location}/connections/${namedConnectionId}`,
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

      // linkGitHubRepository()
      // -getOrCreateGithubConnectionWithSentinel()
      getConnectionStub.onFirstCall().resolves(namedCompleteConn); // Named connection already exists.

      // -promptCloneUri()
      listAllLinkableGitRepositoriesStub.resolves(repos.repositories); // fetchRepositoryCloneUris() returns repos
      promptOnceStub.onFirstCall().resolves(repos.repositories[0].remoteUri); // Selects the repo's clone uri.

      // linkGitHubRepository()
      getConnectionStub.onSecondCall().resolves(namedCompleteConn); // getOrCreateConnection() returns a completed connection.

      // -getOrCreateRepository()
      getRepositoryStub.rejects(new FirebaseError("error", { status: 404 })); // Repo not yet created.
      createRepositoryStub.resolves({ name: "op" }); // Poll on createGitRepositoryLink().
      pollOperationStub.resolves(repos.repositories[0]); // Polling returns the gitRepoLink.

      const r = await repo.linkGitHubRepository(projectId, location, namedConnectionId);

      expect(r).to.be.deep.equal(repos.repositories[0]);
      expect(getConnectionStub).to.be.calledWith(projectId, location, namedConnectionId);
      expect(getConnectionStub).to.not.be.calledWith(projectId, location, oauthConnectionId);
      expect(listConnectionsStub).to.not.be.called;
      expect(createConnectionStub).to.not.be.called;
    });

    it("re-uses existing repository it already exists", async () => {
      getConnectionStub.resolves(completeConn);
      listAllLinkableGitRepositoriesStub.resolves(repos.repositories);
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

  describe("fetchRepositoryCloneUris", () => {
    const sandbox: sinon.SinonSandbox = sinon.createSandbox();
    let listAllLinkableGitRepositoriesStub: sinon.SinonStub;

    beforeEach(() => {
      listAllLinkableGitRepositoriesStub = sandbox
        .stub(devconnect, "listAllLinkableGitRepositories")
        .throws("Unexpected listAllLinkableGitRepositories call");
    });

    afterEach(() => {
      sandbox.verifyAndRestore();
    });

    it("should fetch all linkable repositories from multiple connections", async () => {
      const conn0 = mockConn("conn0");
      const repo0 = mockRepo("repo-0");
      const repo1 = mockRepo("repo-1");
      listAllLinkableGitRepositoriesStub.onFirstCall().resolves([repo0, repo1]);

      const repos = await repo.fetchRepositoryCloneUris(projectId, conn0);

      expect(repos.length).to.equal(2);
      expect(repos).to.deep.equal([repo0.cloneUri, repo1.cloneUri]);
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

      const conns = await repo.listAppHostingConnections(projectId, location);
      expect(conns).to.have.length(2);
      expect(conns.map((c) => extractId(c.name))).to.include.members([
        "apphosting-github-conn-baddcafe",
        "apphosting-github-conn-deadbeef",
      ]);
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

      const installations = await repo.listValidInstallations(projectId, location, conn);
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

      const matchingConnection = await repo.getConnectionForInstallation(
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

      const matchingConnection = await repo.getConnectionForInstallation(
        projectId,
        location,
        installationToMatch,
      );
      expect(matchingConnection).to.be.null;
    });
  });

  describe("ensureSecretManagerAdminGrant", () => {
    const sandbox: sinon.SinonSandbox = sinon.createSandbox();

    let promptOnceStub: sinon.SinonStub;
    let serviceAccountHasRolesStub: sinon.SinonStub;
    let addServiceAccountToRolesStub: sinon.SinonStub;
    let generateP4SAStub: sinon.SinonStub;

    beforeEach(() => {
      promptOnceStub = sandbox.stub(prompt, "promptOnce").throws("Unexpected promptOnce call");
      serviceAccountHasRolesStub = sandbox.stub(rm, "serviceAccountHasRoles");
      sandbox.stub(srcUtils, "getProjectNumber").resolves(projectId);
      addServiceAccountToRolesStub = sandbox.stub(rm, "addServiceAccountToRoles");
      generateP4SAStub = sandbox.stub(devconnect, "generateP4SA");
    });

    afterEach(() => {
      sandbox.verifyAndRestore();
    });

    it("does not prompt user if the developer connect P4SA already has secretmanager.admin permissions", async () => {
      serviceAccountHasRolesStub.resolves(true);
      await repo.ensureSecretManagerAdminGrant(projectId);

      expect(serviceAccountHasRolesStub).calledWith(
        projectId,
        `service-${projectId}@gcp-sa-devconnect.iam.gserviceaccount.com`,
        ["roles/secretmanager.admin"],
      );
      expect(promptOnceStub).to.not.be.called;
    });

    it("prompts user if the developer connect P4SA does not have secretmanager.admin permissions", async () => {
      serviceAccountHasRolesStub.resolves(false);
      promptOnceStub.resolves(true);
      addServiceAccountToRolesStub.resolves();

      await repo.ensureSecretManagerAdminGrant(projectId);

      expect(serviceAccountHasRolesStub).calledWith(
        projectId,
        `service-${projectId}@gcp-sa-devconnect.iam.gserviceaccount.com`,
        ["roles/secretmanager.admin"],
      );

      expect(promptOnceStub).to.be.called;
    });

    it("tries to generate developer connect P4SA if adding role throws an error", async () => {
      serviceAccountHasRolesStub.resolves(false);
      promptOnceStub.resolves(true);
      generateP4SAStub.resolves();
      addServiceAccountToRolesStub.onFirstCall().throws({ code: 400, status: 400 });
      addServiceAccountToRolesStub.onSecondCall().resolves();

      await repo.ensureSecretManagerAdminGrant(projectId);

      expect(serviceAccountHasRolesStub).calledWith(
        projectId,
        `service-${projectId}@gcp-sa-devconnect.iam.gserviceaccount.com`,
        ["roles/secretmanager.admin"],
      ).calledOnce;
      expect(generateP4SAStub).calledOnce;
      expect(promptOnceStub).to.be.called;
    });
  });
  describe("promptGitHubBranch", () => {
    const sandbox: sinon.SinonSandbox = sinon.createSandbox();

    let promptOnceStub: sinon.SinonStub;
    let listAllBranchesStub: sinon.SinonStub;

    beforeEach(() => {
      promptOnceStub = sandbox.stub(prompt, "promptOnce").throws("Unexpected promptOnce call");
      listAllBranchesStub = sandbox
        .stub(devconnect, "listAllBranches")
        .throws("Unexpected listAllBranches call");
    });

    afterEach(() => {
      sandbox.verifyAndRestore();
    });

    it("prompts user for branch", async () => {
      listAllBranchesStub.returns(new Set(["main", "test1"]));

      promptOnceStub.onFirstCall().returns("main");
      const testRepoLink = {
        name: "test",
        cloneUri: "/test",
        createTime: "",
        updateTime: "",
        deleteTime: "",
        reconciling: false,
        uid: "",
      };
      await expect(repo.promptGitHubBranch(testRepoLink)).to.eventually.equal("main");
    });
  });
});
