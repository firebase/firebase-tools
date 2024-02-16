import * as sinon from "sinon";
import { expect } from "chai";

import * as apphosting from "../../../gcp/apphosting";
import * as poller from "../../../operation-poller";
import { createBackend, setDefaultTrafficPolicy } from "../../../init/features/apphosting/index";
import * as deploymentTool from "../../../deploymentTool";

describe("operationsConverter", () => {
  const sandbox: sinon.SinonSandbox = sinon.createSandbox();

  let pollOperationStub: sinon.SinonStub;
  let createBackendStub: sinon.SinonStub;
  let updateTrafficStub: sinon.SinonStub;

  beforeEach(() => {
    pollOperationStub = sandbox
      .stub(poller, "pollOperation")
      .throws("Unexpected pollOperation call");
    createBackendStub = sandbox
      .stub(apphosting, "createBackend")
      .throws("Unexpected createBackend call");
    updateTrafficStub = sandbox
      .stub(apphosting, "updateTraffic")
      .throws("Unexpected updateTraffic call");
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

    it("should create a new backend", async () => {
      createBackendStub.resolves(op);
      pollOperationStub.resolves(completeBackend);

      await createBackend(projectId, location, backendId, cloudBuildConnRepo);

      expect(createBackendStub).to.be.calledWith(projectId, location, backendInput);
    });

    it("should set default rollout policy to 100% all at once", async () => {
      const completeTraffic: apphosting.Traffic = {
        name: `projects/${projectId}/locations/${location}/backends/${backendId}/traffic`,
        current: { splits: [] },
        reconciling: false,
        createTime: "0",
        updateTime: "1",
        etag: "",
        uid: "",
      };
      updateTrafficStub.resolves(op);
      pollOperationStub.resolves(completeTraffic);

      await setDefaultTrafficPolicy(projectId, location, backendId, "main");

      expect(updateTrafficStub).to.be.calledWith(projectId, location, backendId, {
        rolloutPolicy: {
          codebaseBranch: "main",
          stages: [
            {
              progression: "IMMEDIATE",
              targetPercent: 100,
            },
          ],
        },
      });
    });
  });
});
