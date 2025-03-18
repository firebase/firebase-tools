import * as sinon from "sinon";
import { expect } from "chai";

import * as prompt from "../prompt";
import * as apphosting from "../gcp/apphosting";
import * as iam from "../gcp/iam";
import * as resourceManager from "../gcp/resourceManager";
import * as poller from "../operation-poller";
import {
  createBackend,
  deleteBackendAndPoll,
  promptLocation,
  setDefaultTrafficPolicy,
  ensureAppHostingComputeServiceAccount,
  chooseBackends,
  getBackendForAmbiguousLocation,
  getBackend,
} from "./backend";
import * as deploymentTool from "../deploymentTool";
import { FirebaseError } from "../error";

describe("apphosting setup functions", () => {
  const projectId = "projectId";
  const location = "us-central1";
  const backendId = "backendId";

  let promptOnceStub: sinon.SinonStub;
  let pollOperationStub: sinon.SinonStub;
  let createBackendStub: sinon.SinonStub;
  let listBackendsStub: sinon.SinonStub;
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
    listBackendsStub = sinon
      .stub(apphosting, "listBackends")
      .throws("Unexpected listBackends call");
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
      cloneUri: "cloneUri",
      createTime: "0",
      updateTime: "1",
      deleteTime: "2",
      reconciling: true,
      uid: "1",
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

      expect(testResourceIamPermissionsStub).to.be.calledOnce;
      expect(createServiceAccountStub).to.not.be.called;
      expect(addServiceAccountToRolesStub).to.not.be.called;
    });

    it("should succeed if the user can create the service account when it does not exist", async () => {
      testResourceIamPermissionsStub.rejects(
        new FirebaseError("Permission denied", { status: 404 }),
      );
      createServiceAccountStub.resolves();
      addServiceAccountToRolesStub.resolves();

      await expect(ensureAppHostingComputeServiceAccount(projectId, serviceAccount)).to.be
        .fulfilled;

      expect(testResourceIamPermissionsStub).to.be.calledOnce;
      expect(createServiceAccountStub).to.be.calledOnce;
      expect(addServiceAccountToRolesStub).to.be.calledOnce;
    });

    it("should throw an error if the user does not have permissions", async () => {
      testResourceIamPermissionsStub.rejects(
        new FirebaseError("Permission denied", { status: 403 }),
      );

      await expect(
        ensureAppHostingComputeServiceAccount(projectId, serviceAccount),
      ).to.be.rejectedWith(/Failed to create backend due to missing delegation permissions/);

      expect(testResourceIamPermissionsStub).to.be.calledOnce;
      expect(createServiceAccountStub).to.not.be.called;
      expect(addServiceAccountToRolesStub).to.not.be.called;
    });

    it("should throw the error if the user cannot create the service account", async () => {
      testResourceIamPermissionsStub.rejects(
        new FirebaseError("Permission denied", { status: 404 }),
      );
      createServiceAccountStub.rejects(new FirebaseError("failed to create SA"));

      await expect(
        ensureAppHostingComputeServiceAccount(projectId, serviceAccount),
      ).to.be.rejectedWith("failed to create SA");

      expect(testResourceIamPermissionsStub).to.be.calledOnce;
      expect(createServiceAccountStub).to.be.calledOnce;
      expect(addServiceAccountToRolesStub).to.not.be.called;
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
    const supportedLocations = [
      { name: "us-central1", locationId: "us-central1" },
      { name: "us-west1", locationId: "us-west1" },
    ];

    beforeEach(() => {
      listLocationsStub.returns(supportedLocations);
      promptOnceStub.returns(supportedLocations[0].locationId);
    });

    it("returns a location selection", async () => {
      const location = await promptLocation(projectId, /* prompt= */ "");
      expect(location).to.be.eq("us-central1");
    });

    it("uses a default location prompt if none is provided", async () => {
      await promptLocation(projectId);

      expect(promptOnceStub).to.be.calledWith({
        name: "location",
        type: "list",
        default: "us-central1",
        message: "Please select a location:",
        choices: ["us-central1", "us-west1"],
      });
    });

    it("uses a custom location prompt if provided", async () => {
      await promptLocation(projectId, "Custom location prompt:");

      expect(promptOnceStub).to.be.calledWith({
        name: "location",
        type: "list",
        default: "us-central1",
        message: "Custom location prompt:",
        choices: ["us-central1", "us-west1"],
      });
    });

    it("skips the prompt if there's only 1 valid location choice", async () => {
      listLocationsStub.returns(supportedLocations.slice(0, 1));

      await expect(promptLocation(projectId, "Custom location prompt:")).to.eventually.equal(
        supportedLocations[0].locationId,
      );

      expect(promptOnceStub).to.not.be.called;
    });
  });

  describe("chooseBackends", () => {
    const backendChickenAsia = {
      name: `projects/${projectId}/locations/asia-east1/backends/chicken`,
      labels: {},
      createTime: "0",
      updateTime: "1",
      uri: "https://placeholder.com",
    };

    const backendChickenEurope = {
      name: `projects/${projectId}/locations/europe-west4/backends/chicken`,
      labels: {},
      createTime: "0",
      updateTime: "1",
      uri: "https://placeholder.com",
    };

    const backendChickenUS = {
      name: `projects/${projectId}/locations/us-central1/backends/chicken`,
      labels: {},
      createTime: "0",
      updateTime: "1",
      uri: "https://placeholder.com",
    };

    const backendCow = {
      name: `projects/${projectId}/locations/asia-east1/backends/cow`,
      labels: {},
      createTime: "0",
      updateTime: "1",
      uri: "https://placeholder.com",
    };

    const allBackends = [backendChickenAsia, backendChickenEurope, backendChickenUS, backendCow];

    it("returns backend if only one is found", async () => {
      listBackendsStub.resolves({
        backends: allBackends,
      });

      await expect(chooseBackends(projectId, "cow", /* prompt= */ "")).to.eventually.deep.equal([
        backendCow,
      ]);
    });

    it("throws if --force is used when multiple backends are found", async () => {
      listBackendsStub.resolves({
        backends: allBackends,
      });

      await expect(
        chooseBackends(projectId, "chicken", /* prompt= */ "", /* force= */ true),
      ).to.be.rejectedWith(
        "Force cannot be used because multiple backends were found with ID chicken.",
      );
    });

    it("throws if no backend is found", async () => {
      listBackendsStub.resolves({
        backends: allBackends,
      });

      await expect(chooseBackends(projectId, "farmer", /* prompt= */ "")).to.be.rejectedWith(
        'No backend named "farmer" found.',
      );
    });

    it("lets user choose backends when more than one share a name", async () => {
      listBackendsStub.resolves({
        backends: allBackends,
      });
      promptOnceStub.resolves(["chicken(asia-east1)", "chicken(europe-west4)"]);

      await expect(chooseBackends(projectId, "chicken", /* prompt= */ "")).to.eventually.deep.equal(
        [backendChickenAsia, backendChickenEurope],
      );
    });
  });

  describe("getBackendForAmbiguousLocation", () => {
    const backendFoo = {
      name: `projects/${projectId}/locations/${location}/backends/foo`,
      labels: {},
      createTime: "0",
      updateTime: "1",
      uri: "https://placeholder.com",
    };

    const backendFooOtherRegion = {
      name: `projects/${projectId}/locations/otherRegion/backends/foo`,
      labels: {},
      createTime: "0",
      updateTime: "1",
      uri: "https://placeholder.com",
    };

    const backendBar = {
      name: `projects/${projectId}/locations/${location}/backends/bar`,
      labels: {},
      createTime: "0",
      updateTime: "1",
      uri: "https://placeholder.com",
    };

    it("throws if there are no matching backends", async () => {
      listBackendsStub.resolves({ backends: [] });

      await expect(
        getBackendForAmbiguousLocation(projectId, "baz", /* prompt= */ ""),
      ).to.be.rejectedWith(/No backend named "baz" found./);
    });

    it("returns unambiguous backend", async () => {
      listBackendsStub.resolves({ backends: [backendFoo, backendBar] });

      await expect(
        getBackendForAmbiguousLocation(projectId, "foo", /* prompt= */ ""),
      ).to.eventually.equal(backendFoo);
    });

    it("prompts for location if backend is ambiguous", async () => {
      listBackendsStub.resolves({ backends: [backendFoo, backendFooOtherRegion, backendBar] });
      promptOnceStub.resolves(location);

      await expect(
        getBackendForAmbiguousLocation(
          projectId,
          "foo",
          "Please select the location of the backend you'd like to delete:",
        ),
      ).to.eventually.equal(backendFoo);

      expect(promptOnceStub).to.be.calledWith({
        name: "location",
        type: "list",
        message: "Please select the location of the backend you'd like to delete:",
        choices: [location, "otherRegion"],
      });
    });
  });

  describe("getBackend", () => {
    const backendChickenAsia = {
      name: `projects/${projectId}/locations/asia-east1/backends/chicken`,
      labels: {},
      createTime: "0",
      updateTime: "1",
      uri: "https://placeholder.com",
    };

    const backendChickenEurope = {
      name: `projects/${projectId}/locations/europe-west4/backends/chicken`,
      labels: {},
      createTime: "0",
      updateTime: "1",
      uri: "https://placeholder.com",
    };

    const backendCow = {
      name: `projects/${projectId}/locations/us-central1/backends/cow`,
      labels: {},
      createTime: "0",
      updateTime: "1",
      uri: "https://placeholder.com",
    };

    const allBackends = [backendChickenAsia, backendChickenEurope, backendCow];

    it("throws if more than one backend is found", async () => {
      listBackendsStub.resolves({ backends: allBackends });

      await expect(getBackend(projectId, "chicken")).to.be.rejectedWith(
        "You have multiple backends with the same chicken ID in regions: " +
          "asia-east1, europe-west4. " +
          "This is not allowed until we can support more locations. " +
          "Please delete and recreate any backends that share an ID with another backend.",
      );
    });

    it("throws if no backend is found", async () => {
      listBackendsStub.resolves({ backends: allBackends });

      await expect(getBackend(projectId, "farmer")).to.be.rejectedWith(
        "No backend named farmer found.",
      );
    });

    it("returns backend", async () => {
      listBackendsStub.resolves({ backends: allBackends });

      await expect(getBackend(projectId, "cow")).to.eventually.equal(backendCow);
    });
  });
});
