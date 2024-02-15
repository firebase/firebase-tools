import * as sinon from "sinon";
import { expect } from "chai";

import * as apphosting from "../../../gcp/apphosting";
import * as repo from "../../../init/features/apphosting/repo";
import * as poller from "../../../operation-poller";
import * as prompt from "../../../prompt";
import { createBackend, onboardBackend } from "../../../init/features/apphosting/index";
import { FirebaseError } from "../../../error";
import * as deploymentTool from "../../../deploymentTool";

describe("operationsConverter", () => {
  const sandbox: sinon.SinonSandbox = sinon.createSandbox();

  let pollOperationStub: sinon.SinonStub;
  let createBackendStub: sinon.SinonStub;
  let getBackendStub: sinon.SinonStub;
  let linkGitHubRepositoryStub: sinon.SinonStub;
  let promptOnce: sinon.SinonStub;

  beforeEach(() => {
    pollOperationStub = sandbox
      .stub(poller, "pollOperation")
      .throws("Unexpected pollOperation call");
    createBackendStub = sandbox
      .stub(apphosting, "createBackend")
      .throws("Unexpected createBackend call");
    getBackendStub = sandbox.stub(apphosting, "getBackend").throws("Unexpected getBackend call");
    linkGitHubRepositoryStub = sandbox
      .stub(repo, "linkGitHubRepository")
      .throws("Unexpected getBackend call");
    promptOnce = sandbox.stub(prompt, "promptOnce").throws("Unexpected promptOnce call");
  });

  afterEach(() => {
    sandbox.verifyAndRestore();
  });

  describe("onboardBackend", () => {
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

    const cloudBuildConnRepo = {
      name: `projects/${projectId}/locations/${location}/connections/framework-${location}/repositories/repoId`,
      remoteUri: "remoteUri",
      createTime: "0",
      updateTime: "1",
    };

    const backendInput: Omit<apphosting.Backend, apphosting.BackendOutputOnlyFields> = {
      servingLocality: "GLOBAL_ACCESS",
      codebase: {
        repository: cloudBuildConnRepo.name,
        rootDirectory: "/",
      },
      labels: deploymentTool.labels(),
    };

    it("should createBackend", async () => {
      createBackendStub.resolves(op);
      pollOperationStub.resolves(completeBackend);

      await createBackend(projectId, location, backendInput, backendId);

      expect(createBackendStub).to.be.calledWith(projectId, location, backendInput);
    });

    it("should onboard a new backend", async () => {
      const newBackendId = "newBackendId";
      const newPath = `projects/${projectId}/locations/${location}/backends/${newBackendId}`;
      op.name = newPath;
      completeBackend.name = newPath;
      getBackendStub.throws(new FirebaseError("error", { status: 404 }));
      linkGitHubRepositoryStub.resolves(cloudBuildConnRepo);
      createBackendStub.resolves(op);
      pollOperationStub.resolves(completeBackend);
      promptOnce.resolves("main");

      const result = await onboardBackend(projectId, location, backendId);

      expect(result).to.deep.equal(completeBackend);
      expect(createBackendStub).to.be.calledWith(projectId, location, backendInput);
    });
  });
});
