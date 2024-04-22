import * as sinon from "sinon";
import { expect } from "chai";

import * as prompt from "../../prompt";
import * as apphosting from "../../gcp/apphosting";
import * as iam from "../../gcp/iam";
import * as resourceManager from "../../gcp/resourceManager";
import * as poller from "../../operation-poller";
import {
  createBackend,
  deleteBackendAndPoll,
  promptLocation,
  setDefaultTrafficPolicy,
} from "../../apphosting/index";
import * as deploymentTool from "../../deploymentTool";
import { FirebaseError } from "../../error";

describe("operationsConverter", () => {
  const sandbox: sinon.SinonSandbox = sinon.createSandbox();
  const projectId = "projectId";
  const location = "us-central1";
  const backendId = "backendId";

  let promptOnceStub: sinon.SinonStub;
  let pollOperationStub: sinon.SinonStub;
  let createBackendStub: sinon.SinonStub;
  let deleteBackendStub: sinon.SinonStub;
  let updateTrafficStub: sinon.SinonStub;
  let listLocationsStub: sinon.SinonStub;
  let createServiceAccountStub: sinon.SinonStub;
  let addServiceAccountToRolesStub: sinon.SinonStub;

  beforeEach(() => {
    promptOnceStub = sandbox.stub(prompt, "promptOnce").throws("Unexpected promptOnce call");
    pollOperationStub = sandbox
      .stub(poller, "pollOperation")
      .throws("Unexpected pollOperation call");
    createBackendStub = sandbox
      .stub(apphosting, "createBackend")
      .throws("Unexpected createBackend call");
    deleteBackendStub = sandbox
      .stub(apphosting, "deleteBackend")
      .throws("Unexpected deleteBackend call");
    updateTrafficStub = sandbox
      .stub(apphosting, "updateTraffic")
      .throws("Unexpected updateTraffic call");
    listLocationsStub = sandbox
      .stub(apphosting, "listLocations")
      .throws("Unexpected listLocations call");
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

  describe("delete backend", () => {
    it("should delete a backend", async () => {
      const op = {
        name: `projects/${projectId}/locations/${location}/backends/${backendId}`,
        done: true,
      };

      deleteBackendStub.resolves(op);
      pollOperationStub.resolves();

      await deleteBackendAndPoll(projectId, location, backendId);
      expect(deleteBackendStub).to.be.calledWith(projectId, location, backendId);
    });
  });

  describe("prompt location", () => {
    const supportedLocations = [{ name: "us-central1", locationId: "us-central1" }];

    beforeEach(() => {
      listLocationsStub.returns(supportedLocations);
      promptOnceStub.returns(supportedLocations[0].locationId);
    });

    it("returns a location selection", async () => {
      const location = await promptLocation(projectId);
      expect(location).to.be.eq("us-central1");
    });

    it("uses a default location prompt if none is provided", async () => {
      await promptLocation(projectId);

      expect(promptOnceStub).to.be.calledWith({
        name: "location",
        type: "list",
        default: "us-central1",
        message: "Please select a location:",
        choices: ["us-central1"],
      });
    });

    it("uses a custom location prompt if provided", async () => {
      await promptLocation(projectId, "Custom location prompt:");

      expect(promptOnceStub).to.be.calledWith({
        name: "location",
        type: "list",
        default: "us-central1",
        message: "Custom location prompt:",
        choices: ["us-central1"],
      });
    });
  });
});
