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

// function mockConn(id: string): devconnect.Connection {
//   return {
//     name: `projects/${projectId}/locations/${location}/connections/${id}`,
//     disabled: false,
//     createTime: "0",
//     updateTime: "1",
//     installationState: {
//       stage: "COMPLETE",
//       message: "complete",
//       actionUri: "https://google.com",
//     },
//     reconciling: false,
//   };
// }

// function mockRepo(name: string): devconnect.GitRepositoryLink {
//   return {
//     name: `${name}`,
//     cloneUri: `https://github.com/test/${name}.git`,
//     createTime: "",
//     updateTime: "",
//     deleteTime: "",
//     reconciling: false,
//     uid: "",
//   };
// }

// describe("githubConnections", () => {
//   describe("parseConnectionName", () => {
//     it("should parse valid connection name", () => {
//       const connectionName = "projects/my-project/locations/us-central1/connections/my-conn";

//       const expected = {
//         projectId: "my-project",
//         location: "us-central1",
//         id: "my-conn",
//       };

//       expect(repo.parseConnectionName(connectionName)).to.deep.equal(expected);
//     });

//     it("should return undefined for invalid", () => {
//       expect(
//         repo.parseConnectionName(
//           "projects/my-project/locations/us-central1/connections/my-conn/repositories/repo",
//         ),
//       ).to.be.undefined;
//       expect(repo.parseConnectionName("foobar")).to.be.undefined;
//     });
//   });

//   describe("extractRepoSlugFromUri", () => {
//     it("extracts repo from URI", () => {
//       const cloneUri = "https://github.com/user/repo.git";
//       const repoSlug = repo.extractRepoSlugFromUri(cloneUri);
//       expect(repoSlug).to.equal("user/repo");
//     });
//   });

//   describe("generateRepositoryId", () => {
//     it("extracts repo from URI", () => {
//       const cloneUri = "https://github.com/user/repo.git";
//       const repoSlug = repo.generateRepositoryId(cloneUri);
//       expect(repoSlug).to.equal("user-repo");
//     });
//   });

//   describe("connect GitHub repo", () => {
//     const sandbox: sinon.SinonSandbox = sinon.createSandbox();

//     let promptOnceStub: sinon.SinonStub;
//     let pollOperationStub: sinon.SinonStub;
//     let getConnectionStub: sinon.SinonStub;
//     let getRepositoryStub: sinon.SinonStub;
//     let createConnectionStub: sinon.SinonStub;
//     let serviceAccountHasRolesStub: sinon.SinonStub;
//     let createRepositoryStub: sinon.SinonStub;
//     let fetchLinkableRepositoriesStub: sinon.SinonStub;
//     let getProjectNumberStub: sinon.SinonStub;
//     let openInBrowserPopupStub: sinon.SinonStub;

//     beforeEach(() => {
//       promptOnceStub = sandbox.stub(prompt, "promptOnce").throws("Unexpected promptOnce call");
//       pollOperationStub = sandbox
//         .stub(poller, "pollOperation")
//         .throws("Unexpected pollOperation call");
//       getConnectionStub = sandbox
//         .stub(devconnect, "getConnection")
//         .throws("Unexpected getConnection call");
//       getRepositoryStub = sandbox
//         .stub(devconnect, "getGitRepositoryLink")
//         .throws("Unexpected getGitRepositoryLink call");
//       createConnectionStub = sandbox
//         .stub(devconnect, "createConnection")
//         .throws("Unexpected createConnection call");
//       serviceAccountHasRolesStub = sandbox.stub(rm, "serviceAccountHasRoles").resolves(true);
//       createRepositoryStub = sandbox
//         .stub(devconnect, "createGitRepositoryLink")
//         .throws("Unexpected createGitRepositoryLink call");
//       fetchLinkableRepositoriesStub = sandbox
//         .stub(devconnect, "listAllLinkableGitRepositories")
//         .throws("Unexpected listAllLinkableGitRepositories call");
//       sandbox.stub(utils, "openInBrowser").resolves();
//       openInBrowserPopupStub = sandbox
//         .stub(utils, "openInBrowserPopup")
//         .throws("Unexpected openInBrowserPopup call");
//       getProjectNumberStub = sandbox
//         .stub(srcUtils, "getProjectNumber")
//         .throws("Unexpected getProjectNumber call");
//     });

//     afterEach(() => {
//       sandbox.verifyAndRestore();
//     });

//     const connectionId = `apphosting-${location}`;

//     const op = {
//       name: `projects/${projectId}/locations/${location}/connections/${connectionId}`,
//       done: true,
//     };
//     const pendingConn = {
//       name: `projects/${projectId}/locations/${location}/connections/${connectionId}`,
//       disabled: false,
//       createTime: "0",
//       updateTime: "1",
//       installationState: {
//         stage: "PENDING_USER_OAUTH",
//         message: "pending",
//         actionUri: "https://google.com",
//       },
//       reconciling: false,
//     };
//     const completeConn = {
//       name: `projects/${projectId}/locations/${location}/connections/${connectionId}`,
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
//     const repos = {
//       repositories: [
//         {
//           name: "repo0",
//           remoteUri: "https://github.com/test/repo0.git",
//         },
//         {
//           name: "repo1",
//           remoteUri: "https://github.com/test/repo1.git",
//         },
//       ],
//     };

//     it("creates a connection if it doesn't exist", async () => {
//       getConnectionStub.onFirstCall().rejects(new FirebaseError("error", { status: 404 }));
//       getConnectionStub.onSecondCall().resolves(completeConn);
//       createConnectionStub.resolves(op);
//       pollOperationStub.resolves(pendingConn);
//       promptOnceStub.onFirstCall().resolves("any key");

//       await repo.getOrCreateConnection(projectId, location, connectionId);
//       expect(createConnectionStub).to.be.calledWith(projectId, location, connectionId);
//     });

//     it("checks if secret manager admin role is granted for developer connect P4SA when creating an oauth connection", async () => {
//       getConnectionStub.onFirstCall().rejects(new FirebaseError("error", { status: 404 }));
//       getConnectionStub.onSecondCall().resolves(completeConn);
//       createConnectionStub.resolves(op);
//       pollOperationStub.resolves(pendingConn);
//       promptOnceStub.resolves("any key");
//       getProjectNumberStub.onFirstCall().resolves(projectId);
//       openInBrowserPopupStub.resolves({ url: "", cleanup: sandbox.stub() });

//       await repo.getOrCreateOauthConnection(projectId, location);
//       expect(serviceAccountHasRolesStub).to.be.calledWith(
//         projectId,
//         `service-${projectId}@gcp-sa-devconnect.iam.gserviceaccount.com`,
//         ["roles/secretmanager.admin"],
//         true,
//       );
//     });

//     it("creates repository if it doesn't exist", async () => {
//       getConnectionStub.resolves(completeConn);
//       fetchLinkableRepositoriesStub.resolves(repos);
//       promptOnceStub.onFirstCall().resolves(repos.repositories[0].remoteUri);
//       getRepositoryStub.rejects(new FirebaseError("error", { status: 404 }));
//       createRepositoryStub.resolves({ name: "op" });
//       pollOperationStub.resolves(repos.repositories[0]);

//       await repo.getOrCreateRepository(
//         projectId,
//         location,
//         connectionId,
//         repos.repositories[0].remoteUri,
//       );
//       expect(createRepositoryStub).to.be.calledWith(
//         projectId,
//         location,
//         connectionId,
//         "test-repo0",
//         repos.repositories[0].remoteUri,
//       );
//     });

//     it("re-uses existing repository it already exists", async () => {
//       getConnectionStub.resolves(completeConn);
//       fetchLinkableRepositoriesStub.resolves(repos);
//       promptOnceStub.onFirstCall().resolves(repos.repositories[0].remoteUri);
//       getRepositoryStub.resolves(repos.repositories[0]);

//       const r = await repo.getOrCreateRepository(
//         projectId,
//         location,
//         connectionId,
//         repos.repositories[0].remoteUri,
//       );
//       expect(r).to.be.deep.equal(repos.repositories[0]);
//     });
//   });

//   describe("fetchAllRepositories", () => {
//     const sandbox: sinon.SinonSandbox = sinon.createSandbox();
//     let listAllLinkableGitRepositoriesStub: sinon.SinonStub;

//     beforeEach(() => {
//       listAllLinkableGitRepositoriesStub = sandbox
//         .stub(devconnect, "listAllLinkableGitRepositories")
//         .throws("Unexpected listAllLinkableGitRepositories call");
//     });

//     afterEach(() => {
//       sandbox.verifyAndRestore();
//     });

//     it("should fetch all linkable repositories from multiple connections", async () => {
//       const conn0 = mockConn("conn0");
//       const conn1 = mockConn("conn1");
//       const repo0 = mockRepo("repo-0");
//       const repo1 = mockRepo("repo-1");
//       listAllLinkableGitRepositoriesStub.onFirstCall().resolves([repo0]);
//       listAllLinkableGitRepositoriesStub.onSecondCall().resolves([repo1]);

//       const { cloneUris, cloneUriToConnection } = await repo.fetchAllRepositories(projectId, [
//         conn0,
//         conn1,
//       ]);

//       expect(cloneUris.length).to.equal(2);
//       expect(cloneUriToConnection).to.deep.equal({
//         [repo0.cloneUri]: conn0,
//         [repo1.cloneUri]: conn1,
//       });
//     });

//     it("should fetch all linkable repositories without duplicates when there are duplicate connections", async () => {
//       const conn0 = mockConn("conn0");
//       const conn1 = mockConn("conn1");
//       const repo0 = mockRepo("repo-0");
//       const repo1 = mockRepo("repo-1");
//       listAllLinkableGitRepositoriesStub.onFirstCall().resolves([repo0, repo1]);
//       listAllLinkableGitRepositoriesStub.onSecondCall().resolves([repo0, repo1]);

//       const { cloneUris, cloneUriToConnection } = await repo.fetchAllRepositories(projectId, [
//         conn0,
//         conn1,
//       ]);

//       expect(cloneUris.length).to.equal(2);
//       expect(cloneUriToConnection).to.deep.equal({
//         [repo0.cloneUri]: conn1,
//         [repo1.cloneUri]: conn1,
//       });
//     });
//   });

//   describe("listAppHostingConnections", () => {
//     const sandbox: sinon.SinonSandbox = sinon.createSandbox();
//     let listConnectionsStub: sinon.SinonStub;

//     function extractId(name: string): string {
//       const parts = name.split("/");
//       return parts.pop() ?? "";
//     }

//     beforeEach(() => {
//       listConnectionsStub = sandbox
//         .stub(devconnect, "listAllConnections")
//         .throws("Unexpected listAllConnections call");
//     });

//     afterEach(() => {
//       sandbox.verifyAndRestore();
//     });

//     it("filters out non-apphosting connections", async () => {
//       listConnectionsStub.resolves([
//         mockConn("apphosting-github-conn-baddcafe"),
//         mockConn("hooray-conn"),
//         mockConn("apphosting-github-conn-deadbeef"),
//         mockConn("apphosting-github-oauth"),
//       ]);

//       const conns = await repo.listAppHostingConnections(projectId);
//       expect(conns).to.have.length(2);
//       expect(conns.map((c) => extractId(c.name))).to.include.members([
//         "apphosting-github-conn-baddcafe",
//         "apphosting-github-conn-deadbeef",
//       ]);
//     });
//   });

//   describe("ensureSecretManagerAdminGrant", () => {
//     const sandbox: sinon.SinonSandbox = sinon.createSandbox();

//     let promptOnceStub: sinon.SinonStub;
//     let serviceAccountHasRolesStub: sinon.SinonStub;
//     let addServiceAccountToRolesStub: sinon.SinonStub;
//     let generateP4SAStub: sinon.SinonStub;

//     beforeEach(() => {
//       promptOnceStub = sandbox.stub(prompt, "promptOnce").throws("Unexpected promptOnce call");
//       serviceAccountHasRolesStub = sandbox.stub(rm, "serviceAccountHasRoles");
//       sandbox.stub(srcUtils, "getProjectNumber").resolves(projectId);
//       addServiceAccountToRolesStub = sandbox.stub(rm, "addServiceAccountToRoles");
//       generateP4SAStub = sandbox.stub(devconnect, "generateP4SA");
//     });

//     afterEach(() => {
//       sandbox.verifyAndRestore();
//     });

//     it("does not prompt user if the developer connect P4SA already has secretmanager.admin permissions", async () => {
//       serviceAccountHasRolesStub.resolves(true);
//       await repo.ensureSecretManagerAdminGrant(projectId);

//       expect(serviceAccountHasRolesStub).calledWith(
//         projectId,
//         `service-${projectId}@gcp-sa-devconnect.iam.gserviceaccount.com`,
//         ["roles/secretmanager.admin"],
//       );
//       expect(promptOnceStub).to.not.be.called;
//     });

//     it("prompts user if the developer connect P4SA does not have secretmanager.admin permissions", async () => {
//       serviceAccountHasRolesStub.resolves(false);
//       promptOnceStub.resolves(true);
//       addServiceAccountToRolesStub.resolves();

//       await repo.ensureSecretManagerAdminGrant(projectId);

//       expect(serviceAccountHasRolesStub).calledWith(
//         projectId,
//         `service-${projectId}@gcp-sa-devconnect.iam.gserviceaccount.com`,
//         ["roles/secretmanager.admin"],
//       );

//       expect(promptOnceStub).to.be.called;
//     });

//     it("tries to generate developer connect P4SA if adding role throws an error", async () => {
//       serviceAccountHasRolesStub.resolves(false);
//       promptOnceStub.resolves(true);
//       generateP4SAStub.resolves();
//       addServiceAccountToRolesStub.onFirstCall().throws({ code: 400, status: 400 });
//       addServiceAccountToRolesStub.onSecondCall().resolves();

//       await repo.ensureSecretManagerAdminGrant(projectId);

//       expect(serviceAccountHasRolesStub).calledWith(
//         projectId,
//         `service-${projectId}@gcp-sa-devconnect.iam.gserviceaccount.com`,
//         ["roles/secretmanager.admin"],
//       ).calledOnce;
//       expect(generateP4SAStub).calledOnce;
//       expect(promptOnceStub).to.be.called;
//     });
//   });
// });
