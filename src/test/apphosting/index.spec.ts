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
  ensureAppHostingComputeServiceAccount,
} from "../../apphosting/index";
import * as deploymentTool from "../../deploymentTool";
import { FirebaseError } from "../../error";

describe("apphosting setup functions", () => {
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
  let testResourceIamPermissionsStub: sinon.SinonStub;

  beforeEach(() => {
    promptOnceStub = sinon.stub(prompt, "promptOnce").throws("Unexpected promptOnce call");
    pollOperationStub = sinon.stub(poller, "pollOperation").throws("Unexpected pollOperation call");
    createBackendStub = sinon
      .stub(apphosting, "createBackend")
      .throws("Unexpected createBackend call");
    deleteBackendStub = sinon
      .stub(apphosting, "deleteBackend")
      .throws("Unexpected deleteBackend call");
    updateTrafficStub = sinon
      .stub(apphosting, "updateTraffic")
      .throws("Unexpected updateTraffic call");
    listLocationsStub = sinon
      .stub(apphosting, "listLocations")
      .throws("Unexpected listLocations call");
    createServiceAccountStub = sinon
      .stub(iam, "createServiceAccount")
      .throws("Unexpected createServiceAccount call");
    addServiceAccountToRolesStub = sinon
      .stub(resourceManager, "addServiceAccountToRoles")
      .throws("Unexpected addServiceAccountToRoles call");
    testResourceIamPermissionsStub = sinon
      .stub(iam, "testResourceIamPermissions")
      .throws("Unexpected testResourceIamPermissions call");
  });

  afterEach(() => {
    sinon.verifyAndRestore();
  });

  describe("createBackend", () => {
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
        serviceAccount: "custom-service-account",
        appId: webAppId,
      };
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

  describe("ensureAppHostingComputeServiceAccount", () => {
    const serviceAccount = "hello@example.com";

    it("should succeed if the user has permissions for the service account", async () => {
      testResourceIamPermissionsStub.resolves();

      await expect(ensureAppHostingComputeServiceAccount(projectId, serviceAccount)).to.be
        .fulfilled;
    });

    it("should succeed if the user can create the service account when it does not exist", async () => {
      testResourceIamPermissionsStub.rejects(
        new FirebaseError("Permission denied", { status: 404 }),
      );
      createServiceAccountStub.resolves();
      addServiceAccountToRolesStub.resolves();

      await expect(ensureAppHostingComputeServiceAccount(projectId, serviceAccount)).to.be
        .fulfilled;
    });

    it("should throw an error if the user does not have permissions", async () => {
      testResourceIamPermissionsStub.rejects(
        new FirebaseError("Permission denied", { status: 403 }),
      );

      await expect(
        ensureAppHostingComputeServiceAccount(projectId, serviceAccount),
      ).to.be.rejectedWith(/Failed to create backend due to missing delegation permissions/);
    });

    it("should throw the error if the user cannot create the service account", async () => {
      testResourceIamPermissionsStub.rejects(
        new FirebaseError("Permission denied", { status: 404 }),
      );
      createServiceAccountStub.rejects(new FirebaseError("failed to create SA"));

      await expect(
        ensureAppHostingComputeServiceAccount(projectId, serviceAccount),
      ).to.be.rejectedWith("failed to create SA");
    });
  });

  describe("deleteBackendAndPoll", () => {
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

  describe("promptLocation", () => {
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
