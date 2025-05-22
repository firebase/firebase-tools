import { expect } from "chai";
import * as sinon from "sinon";

import * as planner from "./planner";
import * as extensionsApi from "../../extensions/extensionsApi";
import * as manifest from "../../extensions/manifest";
import * as extensionsHelper from "../../extensions/extensionsHelper";
import * as refs from "../../extensions/refs";
import { ExtensionInstance, Extension } from "../../extensions/types";
import { FirebaseError } from "../../error";

function extension(latest?: string, latestApproved?: string): Extension {
  return {
    name: `publishers/test/extensions/test`,
    ref: `test/test`,
    state: "PUBLISHED",
    latestVersion: latest,
    latestApprovedVersion: latestApproved,
    createTime: "",
  };
}
function extensionVersion(version?: string): any {
  return {
    name: `publishers/test/extensions/test/versions/${version}`,
    ref: `test/test@${version}`,
    state: "PUBLISHED",
    hash: "abc123",
    sourceDownloadUri: "https://google.com",
    spec: {
      name: "test",
      version,
      resources: [],
      sourceUrl: "https://google.com",
      params: [],
      systemParam: [],
    },
  };
}
describe("Extensions Deployment Planner", () => {
  describe("resolveSemver", () => {
    let listExtensionVersionsStub: sinon.SinonStub;
    before(() => {
      listExtensionVersionsStub = sinon.stub(extensionsApi, "listExtensionVersions").resolves([
        extensionVersion("0.1.0"),
        extensionVersion("0.1.1"),
        extensionVersion("0.2.0"),
        extensionVersion(), // Explicitly test that this doesn't break on bad data
      ]);
    });

    after(() => {
      listExtensionVersionsStub.restore();
    });

    const cases = [
      {
        description: "should return the latest version that satisifies a semver range",
        in: "^0.1.0",
        out: "0.1.1",
        err: false,
      },
      {
        description: "should match exact semver",
        in: "0.2.0",
        out: "0.2.0",
        err: false,
      },
      {
        description: "should resolve latest to a version",
        in: "latest",
        out: "0.2.0",
        err: false,
      },
      {
        description: "should default to latest-approved version",
        out: "0.1.1",
        err: false,
      },
      {
        description: "should resolve explicit latest-approved",
        in: "latest-approved",
        out: "0.1.1",
        err: false,
      },
      {
        description: "should error if there is no matching version",
        in: "^0.3.0",
        err: true,
      },
    ];

    for (const c of cases) {
      it(c.description, () => {
        if (!c.err) {
          expect(
            planner.resolveVersion(
              {
                publisherId: "test",
                extensionId: "test",
                version: c.in,
              },
              extension("0.2.0", "0.1.1"),
            ),
          ).to.eventually.equal(c.out);
        } else {
          expect(
            planner.resolveVersion(
              {
                publisherId: "test",
                extensionId: "test",
                version: c.in,
              },
              extension("0.2.0", "0.1.1"),
            ),
          ).to.eventually.be.rejected;
        }
      });
    }
  });

  describe("have", () => {
    let listInstancesStub: sinon.SinonStub;

    const SPEC = {
      version: "0.1.0",
      author: {
        authorName: "Firebase",
        url: "https://firebase.google.com",
      },
      resources: [],
      name: "",
      sourceUrl: "",
      params: [],
      systemParams: [],
    };

    const INSTANCE_WITH_EVENTS: ExtensionInstance = {
      name: "projects/my-test-proj/instances/image-resizer",
      createTime: "2019-05-19T00:20:10.416947Z",
      updateTime: "2019-05-19T00:20:10.416947Z",
      state: "ACTIVE",
      serviceAccountEmail: "",
      etag: "123456",
      config: {
        params: {},
        systemParams: {},
        extensionRef: "firebase/image-resizer",
        extensionVersion: "0.1.0",
        name: "projects/my-test-proj/instances/image-resizer/configurations/95355951-397f-4821-a5c2-9c9788b2cc63",
        createTime: "2019-05-19T00:20:10.416947Z",
        eventarcChannel: "projects/my-test-proj/locations/us-central1/channels/firebase",
        allowedEventTypes: ["google.firebase.custom-event-occurred"],
        source: {
          state: "ACTIVE",
          spec: SPEC,
          name: "",
          packageUri: "",
          hash: "",
        },
      },
    };

    const INSTANCE_SPEC_WITH_EVENTS: planner.DeploymentInstanceSpec = {
      instanceId: "image-resizer",
      params: {},
      systemParams: {},
      allowedEventTypes: ["google.firebase.custom-event-occurred"],
      eventarcChannel: "projects/my-test-proj/locations/us-central1/channels/firebase",
      etag: "123456",
      ref: {
        publisherId: "firebase",
        extensionId: "image-resizer",
        version: "0.1.0",
      },
    };

    const INSTANCE_WITH_UNDEFINED_EVENTS_CONFIG = JSON.parse(JSON.stringify(INSTANCE_WITH_EVENTS));
    INSTANCE_WITH_UNDEFINED_EVENTS_CONFIG.config.eventarcChannel = undefined;
    INSTANCE_WITH_UNDEFINED_EVENTS_CONFIG.config.allowedEventTypes = undefined;

    const INSTANCE_SPEC_WITH_UNDEFINED_EVENTS_CONFIG = JSON.parse(
      JSON.stringify(INSTANCE_SPEC_WITH_EVENTS),
    );
    INSTANCE_SPEC_WITH_UNDEFINED_EVENTS_CONFIG.eventarcChannel = undefined;
    INSTANCE_SPEC_WITH_UNDEFINED_EVENTS_CONFIG.allowedEventTypes = undefined;

    const INSTANCE_WITH_EMPTY_EVENTS_CONFIG = JSON.parse(JSON.stringify(INSTANCE_WITH_EVENTS));
    INSTANCE_WITH_EMPTY_EVENTS_CONFIG.config.eventarcChannel = "";
    INSTANCE_WITH_EMPTY_EVENTS_CONFIG.config.allowedEventTypes = [];

    const INSTANCE_SPEC_WITH_EMPTY_EVENTS_CONFIG = JSON.parse(
      JSON.stringify(INSTANCE_SPEC_WITH_EVENTS),
    );
    INSTANCE_SPEC_WITH_EMPTY_EVENTS_CONFIG.eventarcChannel = "";
    INSTANCE_SPEC_WITH_EMPTY_EVENTS_CONFIG.allowedEventTypes = [];

    const INSTANCE_WITH_SDK_LABELS: ExtensionInstance = JSON.parse(
      JSON.stringify(INSTANCE_WITH_EVENTS),
    );
    INSTANCE_WITH_SDK_LABELS.labels = { createdBy: "SDK", codebase: "default" };

    const cases = [
      {
        description: "have() should return correct instance spec with events",
        instances: [INSTANCE_WITH_EVENTS],
        instanceSpecs: [INSTANCE_SPEC_WITH_EVENTS],
      },
      {
        description: "have() should return correct instance spec with undefined events config",
        instances: [INSTANCE_WITH_UNDEFINED_EVENTS_CONFIG],
        instanceSpecs: [INSTANCE_SPEC_WITH_UNDEFINED_EVENTS_CONFIG],
      },
      {
        description: "have() should return correct instance spec with empty events config",
        instances: [INSTANCE_WITH_EMPTY_EVENTS_CONFIG],
        instanceSpecs: [INSTANCE_SPEC_WITH_EMPTY_EVENTS_CONFIG],
      },
      {
        description: "have() should not return SDK defined instances",
        instances: [INSTANCE_WITH_SDK_LABELS],
        instanceSpecs: [],
      },
    ];

    for (const c of cases) {
      it(c.description, async () => {
        listInstancesStub = sinon.stub(extensionsApi, "listInstances").resolves(c.instances);
        const have = await planner.have("test");
        expect(have).to.have.same.deep.members(c.instanceSpecs);
        listInstancesStub.restore();
      });
    }
  });

  describe("haveDynamic", () => {
    let listInstancesStub: sinon.SinonStub;

    const SPEC = {
      version: "0.1.0",
      author: {
        authorName: "Firebase",
        url: "https://firebase.google.com",
      },
      resources: [],
      name: "",
      sourceUrl: "",
      params: [],
      systemParams: [],
    };

    const INSTANCE_WITH_EVENTS: ExtensionInstance = {
      name: "projects/my-test-proj/instances/image-resizer",
      createTime: "2019-05-19T00:20:10.416947Z",
      updateTime: "2019-05-19T00:20:10.416947Z",
      state: "ACTIVE",
      serviceAccountEmail: "",
      etag: "123456",
      labels: { createdBy: "SDK", codebase: "default" },
      config: {
        params: {},
        systemParams: {},
        extensionRef: "firebase/image-resizer",
        extensionVersion: "0.1.0",
        name: "projects/my-test-proj/instances/image-resizer/configurations/95355951-397f-4821-a5c2-9c9788b2cc63",
        createTime: "2019-05-19T00:20:10.416947Z",
        eventarcChannel: "projects/my-test-proj/locations/us-central1/channels/firebase",
        allowedEventTypes: ["google.firebase.custom-event-occurred"],
        source: {
          state: "ACTIVE",
          spec: SPEC,
          name: "",
          packageUri: "",
          hash: "",
        },
      },
    };

    const INSTANCE_SPEC_WITH_EVENTS: planner.DeploymentInstanceSpec = {
      instanceId: "image-resizer",
      params: {},
      systemParams: {},
      allowedEventTypes: ["google.firebase.custom-event-occurred"],
      eventarcChannel: "projects/my-test-proj/locations/us-central1/channels/firebase",
      etag: "123456",
      labels: { createdBy: "SDK", codebase: "default" },
      ref: {
        publisherId: "firebase",
        extensionId: "image-resizer",
        version: "0.1.0",
      },
    };

    const INSTANCE_WITH_UNDEFINED_EVENTS_CONFIG = JSON.parse(JSON.stringify(INSTANCE_WITH_EVENTS));
    INSTANCE_WITH_UNDEFINED_EVENTS_CONFIG.config.eventarcChannel = undefined;
    INSTANCE_WITH_UNDEFINED_EVENTS_CONFIG.config.allowedEventTypes = undefined;

    const INSTANCE_SPEC_WITH_UNDEFINED_EVENTS_CONFIG = JSON.parse(
      JSON.stringify(INSTANCE_SPEC_WITH_EVENTS),
    );
    INSTANCE_SPEC_WITH_UNDEFINED_EVENTS_CONFIG.eventarcChannel = undefined;
    INSTANCE_SPEC_WITH_UNDEFINED_EVENTS_CONFIG.allowedEventTypes = undefined;

    const INSTANCE_WITH_EMPTY_EVENTS_CONFIG = JSON.parse(JSON.stringify(INSTANCE_WITH_EVENTS));
    INSTANCE_WITH_EMPTY_EVENTS_CONFIG.config.eventarcChannel = "";
    INSTANCE_WITH_EMPTY_EVENTS_CONFIG.config.allowedEventTypes = [];

    const INSTANCE_SPEC_WITH_EMPTY_EVENTS_CONFIG = JSON.parse(
      JSON.stringify(INSTANCE_SPEC_WITH_EVENTS),
    );
    INSTANCE_SPEC_WITH_EMPTY_EVENTS_CONFIG.eventarcChannel = "";
    INSTANCE_SPEC_WITH_EMPTY_EVENTS_CONFIG.allowedEventTypes = [];

    const INSTANCE_WITHOUT_SDK_LABELS: ExtensionInstance = JSON.parse(
      JSON.stringify(INSTANCE_WITH_EVENTS),
    );
    INSTANCE_WITHOUT_SDK_LABELS.labels = undefined;

    const cases = [
      {
        description: "haveDynamic() should return correct instance spec with events",
        instances: [INSTANCE_WITH_EVENTS],
        instanceSpecs: [INSTANCE_SPEC_WITH_EVENTS],
      },
      {
        description:
          "haveDynamic() should return correct instance spec with undefined events config",
        instances: [INSTANCE_WITH_UNDEFINED_EVENTS_CONFIG],
        instanceSpecs: [INSTANCE_SPEC_WITH_UNDEFINED_EVENTS_CONFIG],
      },
      {
        description: "haveDynamic() should return correct instance spec with empty events config",
        instances: [INSTANCE_WITH_EMPTY_EVENTS_CONFIG],
        instanceSpecs: [INSTANCE_SPEC_WITH_EMPTY_EVENTS_CONFIG],
      },
      {
        description: "haveDynamic() should not return non-SDK defined instances",
        instances: [INSTANCE_WITHOUT_SDK_LABELS],
        instanceSpecs: [],
      },
    ];

    for (const c of cases) {
      it(c.description, async () => {
        listInstancesStub = sinon.stub(extensionsApi, "listInstances").resolves(c.instances);
        const haveDynamic = await planner.haveDynamic("test");
        expect(haveDynamic).to.have.same.deep.members(c.instanceSpecs);
        listInstancesStub.restore();
      });
    }
  });

  describe("want", () => {
    let readInstanceParamStub: sinon.SinonStub;
    let getFirebaseProjectParamsStub: sinon.SinonStub;
    let listExtensionVersionsStub: sinon.SinonStub;

    before(() => {
      readInstanceParamStub = sinon.stub(manifest, "readInstanceParam");
      getFirebaseProjectParamsStub = sinon.stub(extensionsHelper, "getFirebaseProjectParams");
      listExtensionVersionsStub = sinon.stub(extensionsApi, "listExtensionVersions").resolves([
        extensionVersion("1.0.0")
      ]);
    });

    after(() => {
      readInstanceParamStub.restore();
      getFirebaseProjectParamsStub.restore();
      listExtensionVersionsStub.restore();
    });

    beforeEach(() => {
      readInstanceParamStub.reset();
      getFirebaseProjectParamsStub.reset();
      listExtensionVersionsStub.reset();
      listExtensionVersionsStub.resolves([extensionVersion("1.0.0")]);
    });

    describe("parameter resolution from .env files", () => {
      it("should read parameters via readInstanceParam and partition correctly", async () => {
        const mockParams = {
          USER_PARAM: "user_value",
          ANOTHER_PARAM: "another_value",
          "firebaseextensions.v1beta.function/location": "us-central1",
          "firebaseextensions.v1beta.function/memory": "256MB"
        };

        readInstanceParamStub.returns(mockParams);
        getFirebaseProjectParamsStub.resolves({ PROJECT_ID: "test-proj" });

        const result = await planner.want({
          projectId: "test-project",
          projectNumber: "123456789",
          aliases: ["test-alias"],
          projectDir: "/test/project",
          extensions: {
            "test-instance": "firebase/test-extension@1.0.0"
          }
        });

        expect(result).to.have.length(1);
        expect(result[0].instanceId).to.equal("test-instance");
        expect(result[0].params).to.deep.equal({
          USER_PARAM: "user_value",
          ANOTHER_PARAM: "another_value"
        });
        expect(result[0].systemParams).to.deep.equal({
          "firebaseextensions.v1beta.function/location": "us-central1",
          "firebaseextensions.v1beta.function/memory": "256MB"
        });
      });

      it("should handle Firebase project parameter substitution", async () => {
        const mockParams = {
          PROJECT_PARAM: "${PROJECT_ID}",
          BUCKET_NAME: "${PROJECT_ID}-bucket"
        };

        readInstanceParamStub.returns(mockParams);
        getFirebaseProjectParamsStub.resolves({ 
          PROJECT_ID: "my-project",
          PROJECT_NUMBER: "123456789"
        });

        const result = await planner.want({
          projectId: "my-project",
          projectNumber: "123456789",
          aliases: [],
          projectDir: "/test/project",
          extensions: { "test": "firebase/test@1.0.0" }
        });

        expect(result[0].params).to.deep.equal({
          PROJECT_PARAM: "my-project",
          BUCKET_NAME: "my-project-bucket"
        });
      });

      it("should handle emulator mode", async () => {
        readInstanceParamStub.returns({});
        getFirebaseProjectParamsStub.resolves({});

        await planner.want({
          projectId: "demo-project",
          projectNumber: "123456789",
          aliases: [],
          projectDir: "/test/project",
          extensions: { "test": "firebase/test@1.0.0" },
          emulatorMode: true
        });

        expect(readInstanceParamStub).to.have.been.calledWith({
          projectDir: "/test/project",
          instanceId: "test",
          projectId: "demo-project",
          projectNumber: "123456789",
          aliases: [],
          checkLocal: true
        });
        expect(getFirebaseProjectParamsStub).to.have.been.calledWith("demo-project", true);
      });
    });

    describe("special parameter handling", () => {
      it("should handle ALLOWED_EVENT_TYPES and EVENTARC_CHANNEL correctly", async () => {
        const mockParams = {
          REGULAR_PARAM: "value",
          ALLOWED_EVENT_TYPES: "google.firebase.auth.user.v1.created,google.firebase.auth.user.v1.deleted",
          EVENTARC_CHANNEL: "projects/test/locations/us-central1/channels/firebase"
        };

        readInstanceParamStub.returns(mockParams);
        getFirebaseProjectParamsStub.resolves({});

        const result = await planner.want({
          projectId: "test-project",
          projectNumber: "123456789",
          aliases: [],
          projectDir: "/test/project",
          extensions: { "test": "firebase/test@1.0.0" }
        });

        expect(result[0].params).to.deep.equal({
          REGULAR_PARAM: "value"
        });
        expect(result[0].allowedEventTypes).to.deep.equal([
          "google.firebase.auth.user.v1.created",
          "google.firebase.auth.user.v1.deleted"
        ]);
        expect(result[0].eventarcChannel).to.equal("projects/test/locations/us-central1/channels/firebase");
      });

      it("should handle empty ALLOWED_EVENT_TYPES as empty array", async () => {
        const mockParams = {
          ALLOWED_EVENT_TYPES: "",
          EVENTARC_CHANNEL: "projects/test/locations/us-central1/channels/firebase"
        };

        readInstanceParamStub.returns(mockParams);
        getFirebaseProjectParamsStub.resolves({});

        const result = await planner.want({
          projectId: "test-project",
          projectNumber: "123456789",
          aliases: [],
          projectDir: "/test/project",
          extensions: { "test": "firebase/test@1.0.0" }
        });

        expect(result[0].allowedEventTypes).to.deep.equal([]);
      });

      it("should handle undefined ALLOWED_EVENT_TYPES", async () => {
        const mockParams = { REGULAR_PARAM: "value" };

        readInstanceParamStub.returns(mockParams);
        getFirebaseProjectParamsStub.resolves({});

        const result = await planner.want({
          projectId: "test-project",
          projectNumber: "123456789",
          aliases: [],
          projectDir: "/test/project",
          extensions: { "test": "firebase/test@1.0.0" }
        });

        expect(result[0].allowedEventTypes).to.be.undefined;
        expect(result[0].eventarcChannel).to.be.undefined;
      });
    });

    describe("extension reference handling", () => {
      it("should handle published extension references", async () => {
        readInstanceParamStub.returns({});
        getFirebaseProjectParamsStub.resolves({});

        const result = await planner.want({
          projectId: "test-project",
          projectNumber: "123456789",
          aliases: [],
          projectDir: "/test/project",
          extensions: {
            "resize-images": "firebase/storage-resize-images@1.0.0"
          }
        });

        expect(result[0].ref).to.deep.equal({
          publisherId: "firebase",
          extensionId: "storage-resize-images",
          version: "1.0.0"  // Uses mocked version from listExtensionVersionsStub
        });
      });

      it("should handle local extension paths", async () => {
        readInstanceParamStub.returns({});
        getFirebaseProjectParamsStub.resolves({});

        const result = await planner.want({
          projectId: "test-project",
          projectNumber: "123456789",
          aliases: [],
          projectDir: "/test/project",
          extensions: {
            "local-ext": "./extensions/my-extension"
          }
        });

        expect(result[0].localPath).to.equal("./extensions/my-extension");
        expect(result[0].ref).to.be.undefined;
      });
    });

    describe("error handling", () => {
      it("should handle missing .env file errors", async () => {
        readInstanceParamStub.throws(new FirebaseError("No .env file found"));
        getFirebaseProjectParamsStub.resolves({});

        try {
          await planner.want({
            projectId: "test-project",
            projectNumber: "123456789",
            aliases: [],
            projectDir: "/test/project",
            extensions: { "missing-env": "firebase/test@1.0.0" }
          });
          expect.fail("Expected function to throw");
        } catch (error) {
          expect(error).to.be.instanceOf(FirebaseError);
          expect((error as FirebaseError).message).to.include("Errors while reading 'extensions' in 'firebase.json'");
          expect((error as FirebaseError).message).to.include("No .env file found");
        }
      });

      it("should handle empty extensions configuration", async () => {
        const result = await planner.want({
          projectId: "test-project",
          projectNumber: "123456789",
          aliases: [],
          projectDir: "/test/project",
          extensions: {}
        });

        expect(result).to.deep.equal([]);
      });
    });
  });
});
