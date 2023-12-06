import * as sinon from "sinon";
import { expect } from "chai";

import * as gcp from "../../../gcp/frameworks";
import * as repo from "../../../init/features/frameworks/repo";
import * as poller from "../../../operation-poller";
import { createBackend, getOrCreateBackend } from "../../../init/features/frameworks/index";
import { FirebaseError } from "../../../error";

describe("operationsConverter", () => {
  const sandbox: sinon.SinonSandbox = sinon.createSandbox();

  let pollOperationStub: sinon.SinonStub;
  let createBackendStub: sinon.SinonStub;
  let getBackendStub: sinon.SinonStub;
  let linkGitHubRepositoryStub: sinon.SinonStub;

  beforeEach(() => {
    pollOperationStub = sandbox
      .stub(poller, "pollOperation")
      .throws("Unexpected pollOperation call");
    createBackendStub = sandbox.stub(gcp, "createBackend").throws("Unexpected createBackend call");
    getBackendStub = sandbox.stub(gcp, "getBackend").throws("Unexpected getBackend call");
    linkGitHubRepositoryStub = sandbox
      .stub(repo, "linkGitHubRepository")
      .throws("Unexpected getBackend call");
  });

  afterEach(() => {
    sandbox.verifyAndRestore();
  });

  describe("createBackend", () => {
    const projectId = "projectId";
    const location = "us-central1";
    const backendId = "backendId";
    const op = {
      name: `projects/${projectId}/locations/${location}/backends/${backendId}`,
      done: true,
    };
    const completeBackend = {
      name: `projects/${projectId}/locations/${location}/backends/${backendId}`,
      labels: {},
      createTime: "0",
      updateTime: "1",
      uri: "https://placeholder.com",
    };
    const setup = {
      frameworks: {
        region: location,
        serviceName: backendId,
        existingBackend: true,
        deployMethod: "github",
        branchName: "main",
      },
    };
    const cloudBuildConnRepo = {
      name: `projects/${projectId}/locations/${location}/connections/framework-${location}/repositories/repoId`,
      remoteUri: "remoteUri",
      createTime: "0",
      updateTime: "1",
    };
    const backendInput: Omit<gcp.Backend, gcp.BackendOutputOnlyFields> = {
      servingLocality: "GLOBAL_ACCESS",
      codebase: {
        repository: cloudBuildConnRepo.name,
        rootDirectory: "/",
      },
      labels: {},
    };
    it("should createBackend", async () => {
      createBackendStub.resolves(op);
      pollOperationStub.resolves(completeBackend);

      await createBackend(projectId, location, backendInput, backendId);

      expect(createBackendStub).to.be.calledWith(projectId, location, backendInput);
    });

    it("should return a backend, if user wants use the exiting backend", async () => {
      getBackendStub.resolves(completeBackend);

      const result = await getOrCreateBackend("projectId", setup);

      expect(result).to.deep.equal(completeBackend);
      expect(getBackendStub.calledOnceWithExactly(projectId, location, backendId)).to.be.true;
    });

    it("should create a new backend, if backend doesn't exist", async () => {
      const newBackendId = "newBackendId";
      const newPath = `projects/${projectId}/locations/${location}/backends/${newBackendId}`;
      setup.frameworks.serviceName = newBackendId;
      op.name = newPath;
      completeBackend.name = newPath;
      getBackendStub.throws(new FirebaseError("error", { status: 404 }));
      linkGitHubRepositoryStub.resolves(cloudBuildConnRepo);
      createBackendStub.resolves(op);
      pollOperationStub.resolves(completeBackend);

      const result = await getOrCreateBackend(projectId, setup);

      expect(result).to.deep.equal(completeBackend);
      expect(createBackendStub).to.be.calledWith(projectId, location, backendInput);
    });
  });
});
