import * as sinon from "sinon";
import { expect } from "chai";
import * as prompt from "../../prompt";
import * as poller from "../../operation-poller";
import * as devconnect from "../../gcp/devConnect";
import * as repo from "./githubConnections";
import * as utils from "../../utils";
import * as srcUtils from "../../getProjectNumber";
import * as rm from "../../gcp/resourceManager";
// import { FirebaseError } from "../../error";
import * as githubConnectionUtils from "./utils";
import { completeConnection, mockRepo, mockRepos } from "./test-utils";
// import { completeConnection, mockConn, mockRepo } from "./test-utils";
import { projectId, location } from "./test-utils";

describe("githubConnections", () => {
  describe("connect GitHub repo", () => {
    const sandbox: sinon.SinonSandbox = sinon.createSandbox();

    let promptOnceStub: sinon.SinonStub;
    let getConnectionStub: sinon.SinonStub;
    let serviceAccountHasRolesStub: sinon.SinonStub;
    let getProjectNumberStub: sinon.SinonStub;
    let openInBrowserPopupStub: sinon.SinonStub;
    let listAppHostingConnectionsStub: sinon.SinonStub;
    let createConnectionStub: sinon.SinonStub;
    let listValidInstallationsStub: sinon.SinonStub;
    let generateConnectionIdStub: sinon.SinonStub;
    let fetchRepositoryCloneUrisStub: sinon.SinonStub;
    let getOrCreateRepositoryStub: sinon.SinonStub;
    let getConnectionForInstallationStub: sinon.SinonStub;
    let getOrCreateConnectionStub: sinon.SinonStub;

    beforeEach(() => {
      promptOnceStub = sandbox.stub(prompt, "promptOnce").throws("Unexpected promptOnce call");
      getConnectionStub = sandbox
        .stub(devconnect, "getConnection")
        .throws("Unexpected getConnection call");
      serviceAccountHasRolesStub = sandbox.stub(rm, "serviceAccountHasRoles").resolves(true);
      sandbox.stub(utils, "openInBrowser").resolves();
      openInBrowserPopupStub = sandbox
        .stub(utils, "openInBrowserPopup")
        .throws("Unexpected openInBrowserPopup call");
      getProjectNumberStub = sandbox
        .stub(srcUtils, "getProjectNumber")
        .throws("Unexpected getProjectNumber call");
      listValidInstallationsStub = sandbox
        .stub(githubConnectionUtils, "listValidInstallations")
        .throws("Unexpected listValidInstallations call");
      listAppHostingConnectionsStub = sandbox
        .stub(githubConnectionUtils, "listAppHostingConnections")
        .throws("Unexpected listAllConnections call");
      createConnectionStub = sandbox
        .stub(githubConnectionUtils, "createConnection")
        .throws("Unexpected createConnection call");
      generateConnectionIdStub = sandbox
        .stub(githubConnectionUtils, "generateConnectionId")
        .throws("Unexpected generateConnectionId call");
      fetchRepositoryCloneUrisStub = sandbox
        .stub(githubConnectionUtils, "fetchRepositoryCloneUris")
        .throws("Unexpected fetchRepositoryCloneUris call");
      getOrCreateRepositoryStub = sandbox
        .stub(githubConnectionUtils, "getOrCreateRepository")
        .throws("Unexpected getOrCreateRepository call");
      getConnectionForInstallationStub = sandbox
        .stub(githubConnectionUtils, "getConnectionForInstallation")
        .throws("Unexpected getConnectionForInstallation call");
      getOrCreateConnectionStub = sandbox.stub(githubConnectionUtils, "getOrCreateConnection");
    });

    const mockConnectionId = `apphosting-github-conn-124uifn23`;

    afterEach(() => {
      sandbox.verifyAndRestore();
    });

    // it("checks if secret manager admin role is granted for developer connect P4SA when creating an oauth connection", async () => {
    //   listAppHostingConnectionsStub.resolves([]);
    //   generateConnectionIdStub.onFirstCall().resolves();
    //   createConnectionStub.resolves(completeConnection(mockConnectionId));
    //   promptOnceStub.resolves("any key");
    //   getProjectNumberStub.onFirstCall().resolves(projectId);
    //   openInBrowserPopupStub.resolves({ url: "", cleanup: sandbox.stub() });

    //   await repo.getOrCreateOauthConnection(projectId, location);
    //   expect(serviceAccountHasRolesStub).to.be.calledWith(
    //     projectId,
    //     `service-${projectId}@gcp-sa-devconnect.iam.gserviceaccount.com`,
    //     ["roles/secretmanager.admin"],
    //     true,
    //   );
    // });

    it("links a github repository without an existing oauth connection", async () => {
      const completedConnection = completeConnection(mockConnectionId);
      listAppHostingConnectionsStub.onFirstCall().resolves([]);
      generateConnectionIdStub.onFirstCall().resolves();
      createConnectionStub.onFirstCall().resolves(completedConnection);
      getProjectNumberStub.onFirstCall().resolves(projectId); // Verifies the secret manager grant.

      // promptGitHubInstallation fetches the installations.
      listValidInstallationsStub.resolves([
        {
          id: "installationID",
          name: "main-user",
          type: "user",
        },
      ]);

      promptOnceStub.onFirstCall().resolves("installationID"); // Uses existing Github Account installation.
      listAppHostingConnectionsStub.onSecondCall().resolves([completedConnection]); // getConnectionForInstallation() returns sentinel connection.

      // linkGitHubRepository()
      // -promptCloneUri()
      fetchRepositoryCloneUrisStub.resolves([]); // fetchRepositoryCloneUris() returns repos
      promptOnceStub.onSecondCall().resolves(mockRepos.repositories[0].remoteUri); // promptCloneUri() returns repo's clone uri.
      getConnectionForInstallationStub.onFirstCall().resolves(completedConnection);
      getOrCreateConnectionStub.onFirstCall().resolves();
      getOrCreateRepositoryStub.onFirstCall().resolves();

      const r = await repo.linkGitHubRepository(projectId, location);
      expect(getOrCreateRepositoryStub).to.be.called;
    });

    //   it("links a github repository using a sentinel oauth connection", async () => {
    //     // linkGitHubRepository()
    //     // -getOrCreateFullyInstalledConnection()
    //     listConnectionsStub.onFirstCall().resolves([oauthConn]);

    //     // promptGitHubInstallation fetches the installations.
    //     fetchGitHubInstallationsStub.resolves([
    //       {
    //         id: "installationID",
    //         name: "main-user",
    //         type: "user",
    //       },
    //     ]);

    //     promptOnceStub.onFirstCall().resolves("installationID"); // Uses existing Github Account installation.
    //     listConnectionsStub.resolves([oauthConn]); // getConnectionForInstallation() returns sentinel connection.
    //     createConnectionStub.onFirstCall().resolves({ name: "op" }); // Poll on createsConnection().
    //     pollOperationStub.onFirstCall().resolves(completeConn); // Polling returns the oauth stub connection created.

    //     // linkGitHubRepository()
    //     // -promptCloneUri()
    //     listAllLinkableGitRepositoriesStub.resolves(repos.repositories); // fetchRepositoryCloneUris() returns repos
    //     promptOnceStub.onSecondCall().resolves(repos.repositories[0].remoteUri); // promptCloneUri() returns repo's clone uri.

    //     // linkGitHubRepository()
    //     getConnectionStub.onSecondCall().resolves(completeConn); // getOrCreateConnection() returns a completed connection.

    //     // -getOrCreateRepository()
    //     getRepositoryStub.rejects(new FirebaseError("error", { status: 404 })); // Repo not yet created.
    //     createRepositoryStub.resolves({ name: "op" }); // Poll on createGitRepositoryLink().
    //     pollOperationStub.onSecondCall().resolves(repos.repositories[0]); // Polling returns the gitRepoLink.

    //     const r = await repo.linkGitHubRepository(projectId, location);
    //     expect(getConnectionStub).to.be.calledWith(projectId, location, oauthConnectionId);
    //     expect(getConnectionStub).to.be.calledWith(projectId, location, connectionId);
    //     expect(createConnectionStub).to.be.calledOnce;
    //     expect(createConnectionStub).to.be.calledWithMatch(
    //       projectId,
    //       location,
    //       /apphosting-github-conn-.*/g,
    //       {
    //         appInstallationId: "installationID",
    //         authorizerCredential: oauthConn.githubConfig.authorizerCredential,
    //       },
    //     );

    //     expect(r).to.be.deep.equal(repos.repositories[0]); // Returns the correct repo.
    //   });

    //   it("links a github repository with a new named connection", async () => {
    //     const namedConnectionId = `apphosting-named-${location}`;

    //     const namedCompleteConn = {
    //       name: `projects/${projectId}/locations/${location}/connections/${namedConnectionId}`,
    //       disabled: false,
    //       createTime: "0",
    //       updateTime: "1",
    //       installationState: {
    //         stage: "COMPLETE",
    //         message: "complete",
    //         actionUri: "https://google.com",
    //       },
    //       reconciling: false,
    //     };

    //     // linkGitHubRepository()
    //     // -getOrCreateFullyInstalledConnection()
    //     getConnectionStub.onFirstCall().rejects(new FirebaseError("error", { status: 404 })); // Named connection does not exist.
    //     getConnectionStub.onSecondCall().resolves(oauthConn); // Fetches oauth sentinel.
    //     // promptGitHubInstallation fetches the installations.
    //     fetchGitHubInstallationsStub.resolves([
    //       {
    //         id: "installationID",
    //         name: "main-user",
    //         type: "user",
    //       },
    //     ]);
    //     promptOnceStub.onFirstCall().resolves("installationID"); // Uses existing Github Account installation.
    //     listConnectionsStub.resolves([oauthConn]); // Installation has sentinel connection but not the named one.

    //     // --createFullyInstalledConnection
    //     createConnectionStub.onFirstCall().resolves({ name: "op" }); // Poll on createsConnection().
    //     pollOperationStub.onFirstCall().resolves(namedCompleteConn); // Polling returns the connection created.

    //     // linkGitHubRepository()
    //     // -promptCloneUri()
    //     listAllLinkableGitRepositoriesStub.resolves(repos.repositories); // fetchRepositoryCloneUris() returns repos
    //     promptOnceStub.onSecondCall().resolves(repos.repositories[0].remoteUri); // promptCloneUri() returns repo's clone uri.

    //     // linkGitHubRepository()
    //     getConnectionStub.onThirdCall().resolves(namedCompleteConn); // getOrCreateConnection() returns a completed connection.

    //     // -getOrCreateRepository()
    //     getRepositoryStub.rejects(new FirebaseError("error", { status: 404 })); // Repo not yet created.
    //     createRepositoryStub.resolves({ name: "op" }); // Poll on createGitRepositoryLink().
    //     pollOperationStub.onSecondCall().resolves(repos.repositories[0]); // Polling returns the gitRepoLink.

    //     const r = await repo.linkGitHubRepository(projectId, location, namedConnectionId);

    //     expect(r).to.be.deep.equal(repos.repositories[0]);
    //     expect(getConnectionStub).to.be.calledWith(projectId, location, oauthConnectionId);
    //     expect(getConnectionStub).to.be.calledWith(projectId, location, namedConnectionId);
    //     expect(createConnectionStub).to.be.calledWith(projectId, location, namedConnectionId, {
    //       appInstallationId: "installationID",
    //       authorizerCredential: oauthConn.githubConfig.authorizerCredential,
    //     });
    //   });

    //   it("reuses an existing named connection to link github repo", async () => {
    //     const namedConnectionId = `apphosting-named-${location}`;

    //     const namedCompleteConn = {
    //       name: `projects/${projectId}/locations/${location}/connections/${namedConnectionId}`,
    //       disabled: false,
    //       createTime: "0",
    //       updateTime: "1",
    //       installationState: {
    //         stage: "COMPLETE",
    //         message: "complete",
    //         actionUri: "https://google.com",
    //       },
    //       reconciling: false,
    //     };

    //     // linkGitHubRepository()
    //     // -getOrCreateGithubConnectionWithSentinel()
    //     getConnectionStub.onFirstCall().resolves(namedCompleteConn); // Named connection already exists.

    //     // -promptCloneUri()
    //     listAllLinkableGitRepositoriesStub.resolves(repos.repositories); // fetchRepositoryCloneUris() returns repos
    //     promptOnceStub.onFirstCall().resolves(repos.repositories[0].remoteUri); // Selects the repo's clone uri.

    //     // linkGitHubRepository()
    //     getConnectionStub.onSecondCall().resolves(namedCompleteConn); // getOrCreateConnection() returns a completed connection.

    //     // -getOrCreateRepository()
    //     getRepositoryStub.rejects(new FirebaseError("error", { status: 404 })); // Repo not yet created.
    //     createRepositoryStub.resolves({ name: "op" }); // Poll on createGitRepositoryLink().
    //     pollOperationStub.resolves(repos.repositories[0]); // Polling returns the gitRepoLink.

    //     const r = await repo.linkGitHubRepository(projectId, location, namedConnectionId);

    //     expect(r).to.be.deep.equal(repos.repositories[0]);
    //     expect(getConnectionStub).to.be.calledWith(projectId, location, namedConnectionId);
    //     expect(getConnectionStub).to.not.be.calledWith(projectId, location, oauthConnectionId);
    //     expect(listConnectionsStub).to.not.be.called;
    //     expect(createConnectionStub).to.not.be.called;
    //   });

    //   it("re-uses existing repository it already exists", async () => {
    //     getConnectionStub.resolves(completeConn);
    //     listAllLinkableGitRepositoriesStub.resolves(repos.repositories);
    //     promptOnceStub.onFirstCall().resolves(repos.repositories[0].remoteUri);
    //     getRepositoryStub.resolves(repos.repositories[0]);

    //     const r = await repo.getOrCreateRepository(
    //       projectId,
    //       location,
    //       connectionId,
    //       repos.repositories[0].remoteUri,
    //     );
    //     expect(r).to.be.deep.equal(repos.repositories[0]);
    //   });
    // });

    // describe("fetchRepositoryCloneUris", () => {
    //   const sandbox: sinon.SinonSandbox = sinon.createSandbox();
    //   let listAllLinkableGitRepositoriesStub: sinon.SinonStub;

    //   beforeEach(() => {
    //     listAllLinkableGitRepositoriesStub = sandbox
    //       .stub(devconnect, "listAllLinkableGitRepositories")
    //       .throws("Unexpected listAllLinkableGitRepositories call");
    //   });

    //   afterEach(() => {
    //     sandbox.verifyAndRestore();
    //   });

    //   it("should fetch all linkable repositories from multiple connections", async () => {
    //     const conn0 = mockConn("conn0");
    //     const repo0 = mockRepo("repo-0");
    //     const repo1 = mockRepo("repo-1");
    //     listAllLinkableGitRepositoriesStub.onFirstCall().resolves([repo0, repo1]);

    //     const repos = await repo.fetchRepositoryCloneUris(projectId, conn0);

    //     expect(repos.length).to.equal(2);
    //     expect(repos).to.deep.equal([repo0.cloneUri, repo1.cloneUri]);
    //   });
    // });

    // describe("ensureSecretManagerAdminGrant", () => {
    //   const sandbox: sinon.SinonSandbox = sinon.createSandbox();

    //   let promptOnceStub: sinon.SinonStub;
    //   let serviceAccountHasRolesStub: sinon.SinonStub;
    //   let addServiceAccountToRolesStub: sinon.SinonStub;
    //   let generateP4SAStub: sinon.SinonStub;

    //   beforeEach(() => {
    //     promptOnceStub = sandbox.stub(prompt, "promptOnce").throws("Unexpected promptOnce call");
    //     serviceAccountHasRolesStub = sandbox.stub(rm, "serviceAccountHasRoles");
    //     sandbox.stub(srcUtils, "getProjectNumber").resolves(projectId);
    //     addServiceAccountToRolesStub = sandbox.stub(rm, "addServiceAccountToRoles");
    //     generateP4SAStub = sandbox.stub(devconnect, "generateP4SA");
    //   });

    //   afterEach(() => {
    //     sandbox.verifyAndRestore();
    //   });

    //   it("does not prompt user if the developer connect P4SA already has secretmanager.admin permissions", async () => {
    //     serviceAccountHasRolesStub.resolves(true);
    //     await repo.ensureSecretManagerAdminGrant(projectId);

    //     expect(serviceAccountHasRolesStub).calledWith(
    //       projectId,
    //       `service-${projectId}@gcp-sa-devconnect.iam.gserviceaccount.com`,
    //       ["roles/secretmanager.admin"],
    //     );
    //     expect(promptOnceStub).to.not.be.called;
    //   });

    //   it("prompts user if the developer connect P4SA does not have secretmanager.admin permissions", async () => {
    //     serviceAccountHasRolesStub.resolves(false);
    //     promptOnceStub.resolves(true);
    //     addServiceAccountToRolesStub.resolves();

    //     await repo.ensureSecretManagerAdminGrant(projectId);

    //     expect(serviceAccountHasRolesStub).calledWith(
    //       projectId,
    //       `service-${projectId}@gcp-sa-devconnect.iam.gserviceaccount.com`,
    //       ["roles/secretmanager.admin"],
    //     );

    //     expect(promptOnceStub).to.be.called;
    //   });

    //   it("tries to generate developer connect P4SA if adding role throws an error", async () => {
    //     serviceAccountHasRolesStub.resolves(false);
    //     promptOnceStub.resolves(true);
    //     generateP4SAStub.resolves();
    //     addServiceAccountToRolesStub.onFirstCall().throws({ code: 400, status: 400 });
    //     addServiceAccountToRolesStub.onSecondCall().resolves();

    //     await repo.ensureSecretManagerAdminGrant(projectId);

    //     expect(serviceAccountHasRolesStub).calledWith(
    //       projectId,
    //       `service-${projectId}@gcp-sa-devconnect.iam.gserviceaccount.com`,
    //       ["roles/secretmanager.admin"],
    //     ).calledOnce;
    //     expect(generateP4SAStub).calledOnce;
    //     expect(promptOnceStub).to.be.called;
    //   });
    // });
    // describe("promptGitHubBranch", () => {
    //   const sandbox: sinon.SinonSandbox = sinon.createSandbox();

    //   let promptOnceStub: sinon.SinonStub;
    //   let listAllBranchesStub: sinon.SinonStub;

    //   beforeEach(() => {
    //     promptOnceStub = sandbox.stub(prompt, "promptOnce").throws("Unexpected promptOnce call");
    //     listAllBranchesStub = sandbox
    //       .stub(devconnect, "listAllBranches")
    //       .throws("Unexpected listAllBranches call");
    //   });

    //   afterEach(() => {
    //     sandbox.verifyAndRestore();
    //   });

    //   it("prompts user for branch", async () => {
    //     listAllBranchesStub.returns(new Set(["main", "test1"]));

    //     promptOnceStub.onFirstCall().returns("main");
    //     const testRepoLink = {
    //       name: "test",
    //       cloneUri: "/test",
    //       createTime: "",
    //       updateTime: "",
    //       deleteTime: "",
    //       reconciling: false,
    //       uid: "",
    //     };
    //     await expect(repo.promptGitHubBranch(testRepoLink)).to.eventually.equal("main");
    //   });
  });
});
