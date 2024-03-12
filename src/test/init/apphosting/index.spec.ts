import * as sinon from "sinon";
import { expect } from "chai";

import * as apphosting from "../../../gcp/apphosting";
import * as iam from "../../../gcp/iam";
import * as resourceManager from "../../../gcp/resourceManager";
import * as poller from "../../../operation-poller";
import { createBackend, setDefaultTrafficPolicy } from "../../../init/features/apphosting/index";
import * as deploymentTool from "../../../deploymentTool";
import { FirebaseError } from "../../../error";

describe("operationsConverter", () => {
  const sandbox: sinon.SinonSandbox = sinon.createSandbox();

  let pollOperationStub: sinon.SinonStub;
  let createBackendStub: sinon.SinonStub;
  let updateTrafficStub: sinon.SinonStub;
  let createServiceAccountStub: sinon.SinonStub;
  let addServiceAccountToRolesStub: sinon.SinonStub;

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
    createServiceAccountStub = sandbox
      .stub(iam, "createServiceAccount")
      .throws("Unexpected createServiceAccount call");
    addServiceAccountToRolesStub = sandbox
      .stub(resourceManager, "addServiceAccountToRoles")
      .throws("Unexpected addServiceAccountToRoles call");
  });

  afterEach(() => {
    sandbox.verifyAndRestore();
  });

  describe("onboardBackend", () => {
    const projectId = "projectId";
    const location = "us-central1";
    const backendId = "backendId";
    const webAppId = "webAppId";

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

    it("should create a new backend", async () => {
      createBackendStub.resolves(op);
      pollOperationStub.resolves(completeBackend);

      await createBackend(
        projectId,
        location,
        backendId,
        cloudBuildConnRepo,
        "custom-service-account",
        webAppId,
      );

      const backendInput: Omit<apphosting.Backend, apphosting.BackendOutputOnlyFields> = {
        servingLocality: "GLOBAL_ACCESS",
        codebase: {
          repository: cloudBuildConnRepo.name,
          rootDirectory: "/",
        },
        labels: deploymentTool.labels(),
        appId: webAppId,
      };
      expect(createBackendStub).to.be.calledWith(projectId, location, backendInput);
    });

    it("should provision the default compute service account", async () => {
      createBackendStub.resolves(op);
      pollOperationStub
        // Initial CreateBackend operation should throw a permission denied to trigger service account creation.
        .onFirstCall()
        .throws(
          new FirebaseError(
            `missing actAs permission on firebase-app-hosting-compute@${projectId}.iam.gserviceaccount.com`,
            { status: 403 },
          ),
        )
        .onSecondCall()
        .resolves(completeBackend);
      createServiceAccountStub.resolves({});
      addServiceAccountToRolesStub.resolves({});

      await createBackend(
        projectId,
        location,
        backendId,
        cloudBuildConnRepo,
        /* serviceAccount= */ null,
        webAppId,
      );

      // CreateBackend should be called twice; once initially and once after the service account was created
      expect(createBackendStub).to.be.calledTwice;
      expect(createServiceAccountStub).to.be.calledOnce;
      expect(addServiceAccountToRolesStub).to.be.calledOnce;
    });

    it("does not try to provision a custom service account", () => {
      createBackendStub.resolves(op);
      pollOperationStub
        // Initial CreateBackend operation should throw a permission denied to
        // potentially trigger service account creation.
        .onFirstCall()
        .throws(
          new FirebaseError("missing actAs permission on my-service-account", { status: 403 }),
        )
        .onSecondCall()
        .resolves(completeBackend);

      expect(
        createBackend(
          projectId,
          location,
          backendId,
          cloudBuildConnRepo,
          /* serviceAccount= */ "my-service-account",
          webAppId,
        ),
      ).to.be.rejectedWith(
        FirebaseError,
        "Failed to create backend due to missing delegation permissions for my-service-account. Make sure you have the iam.serviceAccounts.actAs permission.",
      );

      expect(createBackendStub).to.be.calledOnce;
      expect(createServiceAccountStub).to.not.have.been.called;
      expect(addServiceAccountToRolesStub).to.not.have.been.called;
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
