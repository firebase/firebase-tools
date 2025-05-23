import { expect } from "chai";
import * as sinon from "sinon";
import * as fs from "fs";

import * as planner from "./planner";
import * as extensionsApi from "../../extensions/extensionsApi";
import * as manifest from "../../extensions/manifest";
import * as specHelper from "../../extensions/emulator/specHelper";
import {
  ExtensionInstance,
  Extension,
  ExtensionSpec,
  ExtensionVersion,
  ParamType,
} from "../../extensions/types";
import { FirebaseError } from "../../error";
import * as functionsConfig from "../../functionsConfig";
import * as secretManager from "../../gcp/secretManager";

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
function mockExtensionSpec(version?: string): ExtensionSpec {
  return {
    name: "test",
    version: version || "0.1.0",
    resources: [
      {
        name: "testFunction",
        type: "firebaseextensions.v1beta.function",
        properties: {
          entryPoint: "testFunction",
          runtime: "nodejs20",
          httpsTrigger: {},
        },
      },
    ],
    sourceUrl: "https://google.com",
    params: [
      {
        param: "USER_PARAM",
        label: "User Parameter",
        description: "A test user parameter",
        type: ParamType.STRING,
        required: true,
      },
      {
        param: "ANOTHER_PARAM",
        label: "Another Parameter",
        description: "Another test parameter",
        type: ParamType.STRING,
        required: false,
        default: "default_value",
      },
    ],
    systemParams: [
      {
        param: "firebaseextensions.v1beta.function/location",
        label: "Function Location",
        description: "Location for the function",
        type: ParamType.STRING,
        required: true,
        default: "us-central1",
      },
    ],
  };
}

function extensionVersion(version?: string): ExtensionVersion {
  return {
    name: `publishers/test/extensions/test/versions/${version || ""}`,
    ref: `test/test@${version || ""}`,
    state: "PUBLISHED",
    hash: "abc123",
    sourceDownloadUri: "https://google.com",
    spec: mockExtensionSpec(version),
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
      it(c.description, async () => {
        if (!c.err) {
          await expect(
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
          await expect(
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
    const sandbox = sinon.createSandbox();

    let resolveVersionStub: sinon.SinonStub;
    let getExtensionVersionStub: sinon.SinonStub;
    let listInstancesStub: sinon.SinonStub;
    let readInstanceParamStub: sinon.SinonStub;
    let resolveBackendStub: sinon.SinonStub;
    let readExtensionYamlStub: sinon.SinonStub;
    let readPostinstallStub: sinon.SinonStub;
    let listExtensionVersionsStub: sinon.SinonStub;

    before(() => {
      resolveVersionStub = sandbox.stub(planner, "resolveVersion");
      getExtensionVersionStub = sinon.stub(extensionsApi, "getExtensionVersion");
      readInstanceParamStub = sinon.stub(manifest, "readInstanceParam");
      const build = require("../functions/build");
      resolveBackendStub = sinon.stub(build, "resolveBackend");
      readExtensionYamlStub = sinon.stub(specHelper, "readExtensionYaml");
      readPostinstallStub = sinon.stub(specHelper, "readPostinstall");
      listExtensionVersionsStub = sinon
        .stub(extensionsApi, "listExtensionVersions")
        .resolves([extensionVersion("1.0.0")]);
    });

    after(() => {
      sandbox.restore();
    });

    beforeEach(() => {
      getExtensionVersionStub.reset();
      listInstancesStub.reset();
      readInstanceParamStub.reset();
      resolveBackendStub.reset();
      readExtensionYamlStub.reset();
      readPostinstallStub.reset();
      listExtensionVersionsStub.reset();

      // Default behavior for stubs
      getExtensionVersionStub.resolves(extensionVersion("1.0.0"));
      listInstancesStub.resolves([]); // No existing instances
      readExtensionYamlStub.resolves(mockExtensionSpec());
      readPostinstallStub.resolves("postinstall content");
      listExtensionVersionsStub.resolves([extensionVersion("1.0.0")]);

      // Mock readInstanceParam to return user env vars
      readInstanceParamStub.returns({
        USER_PARAM: "user_value",
        ANOTHER_PARAM: "another_value",
        "firebaseextensions.v1beta.function/location": "us-central1",
        "firebaseextensions.v1beta.function/memory": "256MB",
      });

      // Mock build.resolveBackend to simulate parameter resolution
      resolveBackendStub.resolves({
        backend: {},
        envs: {
          USER_PARAM: { toString: () => "user_value" },
          ANOTHER_PARAM: { toString: () => "another_value" },
          "firebaseextensions.v1beta.function/location": { toString: () => "us-central1" },
          "firebaseextensions.v1beta.function/memory": { toString: () => "256MB" },
        },
      });
    });

    describe("parameter resolution using functions pipeline", () => {
      it("should resolve parameters using functions parameter resolution pipeline", async () => {
        const result = await planner.want({
          nonInteractive: true,
          projectId: "test-project",
          projectNumber: "123456789",
          aliases: ["test-alias"],
          projectDir: "/test/project",
          extensions: {
            "test-instance": "firebase/test-extension@1.0.0",
          },
        });

        expect(result).to.have.length(1);
        expect(result[0].instanceId).to.equal("test-instance");
        expect(result[0].params).to.deep.equal({
          USER_PARAM: "user_value",
          ANOTHER_PARAM: "another_value",
        });
        expect(result[0].systemParams).to.deep.equal({
          "firebaseextensions.v1beta.function/location": "us-central1",
          "firebaseextensions.v1beta.function/memory": "256MB",
        });

        // Verify that the new parameter resolution pipeline was called
        expect(getExtensionVersionStub).to.have.been.calledOnce;
        expect(resolveBackendStub).to.have.been.calledOnce;
      });

      it("should handle Firebase project parameter substitution", async () => {
        // Mock readInstanceParam to return params with substitution patterns
        readInstanceParamStub.returns({
          PROJECT_PARAM: "${PROJECT_ID}",
          BUCKET_NAME: "${PROJECT_ID}-bucket",
        });

        // Mock build.resolveBackend to return substituted values
        resolveBackendStub.resolves({
          backend: {},
          envs: {
            PROJECT_PARAM: { toString: () => "my-project" },
            BUCKET_NAME: { toString: () => "my-project-bucket" },
          },
        });

        const result = await planner.want({
          nonInteractive: true,
          projectId: "my-project",
          projectNumber: "123456789",
          aliases: [],
          projectDir: "/test/project",
          extensions: { test: "firebase/test@1.0.0" },
        });

        expect(result[0].params).to.deep.equal({
          PROJECT_PARAM: "my-project",
          BUCKET_NAME: "my-project-bucket",
        });
      });

      it("should handle emulator mode", async () => {
        const result = await planner.want({
          nonInteractive: true,
          projectId: "demo-project",
          projectNumber: "123456789",
          aliases: [],
          projectDir: "/test/project",
          extensions: { test: "firebase/test@1.0.0" },
          emulatorMode: true,
        });

        expect(result).to.have.length(1);
        expect(result[0].instanceId).to.equal("test");

        // Verify emulator mode was passed to parameter resolution
        expect(resolveBackendStub).to.have.been.calledWith(
          sinon.match({
            isEmulator: true,
            userEnvOpt: sinon.match({ isEmulator: true }),
          }),
        );
      });
    });

    describe("special parameter handling", () => {
      it("should handle ALLOWED_EVENT_TYPES and EVENTARC_CHANNEL correctly", async () => {
        // Mock parameter resolution to return transformed values
        resolveBackendStub.resolves({
          backend: {},
          envs: {
            REGULAR_PARAM: { toString: () => "value" },
            ALLOWED_EVENT_TYPES: {
              toString: () =>
                "google.firebase.auth.user.v1.created,google.firebase.auth.user.v1.deleted",
            },
            EVENTARC_CHANNEL: {
              toString: () => "projects/test/locations/us-central1/channels/firebase",
            },
          },
        });

        const result = await planner.want({
          nonInteractive: true,
          projectId: "test-project",
          projectNumber: "123456789",
          aliases: [],
          projectDir: "/test/project",
          extensions: { test: "firebase/test@1.0.0" },
        });

        expect(result[0].params).to.deep.equal({
          REGULAR_PARAM: "value",
        });
        expect(result[0].allowedEventTypes).to.deep.equal([
          "google.firebase.auth.user.v1.created",
          "google.firebase.auth.user.v1.deleted",
        ]);
        expect(result[0].eventarcChannel).to.equal(
          "projects/test/locations/us-central1/channels/firebase",
        );
      });

      it("should handle empty ALLOWED_EVENT_TYPES as empty array", async () => {
        // Mock parameter resolution to return empty allowedEventTypes
        resolveBackendStub.resolves({
          backend: {},
          envs: {
            ALLOWED_EVENT_TYPES: { toString: () => "" },
            EVENTARC_CHANNEL: {
              toString: () => "projects/test/locations/us-central1/channels/firebase",
            },
          },
        });

        const result = await planner.want({
          nonInteractive: true,
          projectId: "test-project",
          projectNumber: "123456789",
          aliases: [],
          projectDir: "/test/project",
          extensions: { test: "firebase/test@1.0.0" },
        });

        expect(result[0].allowedEventTypes).to.deep.equal([]);
      });

      it("should handle undefined ALLOWED_EVENT_TYPES", async () => {
        // Mock parameter resolution to return undefined for allowedEventTypes
        resolveBackendStub.resolves({
          backend: {},
          envs: {
            REGULAR_PARAM: { toString: () => "value" },
            // No ALLOWED_EVENT_TYPES or EVENTARC_CHANNEL
          },
        });

        const result = await planner.want({
          nonInteractive: true,
          projectId: "test-project",
          projectNumber: "123456789",
          aliases: [],
          projectDir: "/test/project",
          extensions: { test: "firebase/test@1.0.0" },
        });

        expect(result[0].allowedEventTypes).to.be.undefined;
        expect(result[0].eventarcChannel).to.be.undefined;
      });
    });

    describe("extension reference handling", () => {
      it("should handle published extension references", async () => {
        const result = await planner.want({
          nonInteractive: true,
          projectId: "test-project",
          projectNumber: "123456789",
          aliases: [],
          projectDir: "/test/project",
          extensions: {
            "resize-images": "firebase/storage-resize-images@1.0.0",
          },
        });

        expect(result[0].ref).to.deep.equal({
          publisherId: "firebase",
          extensionId: "storage-resize-images",
          version: "1.0.0", // Uses mocked version from listExtensionVersionsStub
        });
      });

      it("should handle local extension paths", async () => {
        const result = await planner.want({
          nonInteractive: true,
          projectId: "test-project",
          projectNumber: "123456789",
          aliases: [],
          projectDir: "/test/project",
          extensions: {
            "local-ext": "./extensions/my-extension",
          },
        });

        expect(result[0].localPath).to.equal("./extensions/my-extension");
        expect(result[0].ref).to.be.undefined;
      });
    });

    describe("error handling", () => {
      it("should handle parameter resolution errors", async () => {
        // Mock parameter resolution to throw an error
        resolveBackendStub.rejects(
          new FirebaseError("Missing required parameter USER_PARAM", { exit: 1 }),
        );

        try {
          await planner.want({
            nonInteractive: true,
            projectId: "test-project",
            projectNumber: "123456789",
            aliases: [],
            projectDir: "/test/project",
            extensions: { "missing-param": "firebase/test@1.0.0" },
          });
          expect.fail("Expected function to throw");
        } catch (error) {
          expect(error).to.be.instanceOf(FirebaseError);
          expect((error as FirebaseError).message).to.include(
            "Errors while reading 'extensions' in 'firebase.json'",
          );
          expect((error as FirebaseError).message).to.include(
            "Missing required parameter USER_PARAM",
          );
        }
      });

      it("should handle empty extensions configuration", async () => {
        const result = await planner.want({
          nonInteractive: true,
          projectId: "test-project",
          projectNumber: "123456789",
          aliases: [],
          projectDir: "/test/project",
          extensions: {},
        });

        expect(result).to.deep.equal([]);
      });
    });
  });

  describe("want", () => {
    let getExtensionVersionStub: sinon.SinonStub;
    let listInstancesStub: sinon.SinonStub;
    let readExtensionYamlStub: sinon.SinonStub;
    let readPostinstallStub: sinon.SinonStub;
    let listExtensionVersionsStub: sinon.SinonStub;
    let existsSyncStub: sinon.SinonStub;
    let readFileSyncStub: sinon.SinonStub;
    let mkdirSyncStub: sinon.SinonStub;
    let writeFileSyncStub: sinon.SinonStub;
    let getFirebaseConfigStub: sinon.SinonStub;
    let readInstanceParamStub: sinon.SinonStub;
    let secretExistsStub: sinon.SinonStub;
    let promptOnceStub: sinon.SinonStub;

    // Create a more realistic extension spec with expressions
    function extensionSpecWithExpressions(): ExtensionSpec {
      return {
        name: "test-extension",
        version: "1.0.0",
        resources: [
          {
            name: "processPayment",
            type: "firebaseextensions.v1beta.function",
            properties: {
              entryPoint: "processPayment",
              runtime: "nodejs20",
              httpsTrigger: {},
              availableMemoryMb: 256,
            },
            // Environment variables are defined at resource level in extension spec
            propertiesYaml: `
              function:
                environmentVariables:
                  API_ENDPOINT: \${param:API_KEY}/endpoint
                  WEBHOOK_URL: \${WEBHOOK_URL}
                  DEBUG_MODE: \${param:DEBUG_MODE}
            `,
          },
        ],
        sourceUrl: "https://example.com",
        params: [
          {
            param: "API_KEY",
            label: "API Key",
            description: "Your API key",
            type: ParamType.STRING,
            required: true,
          },
          {
            param: "WEBHOOK_URL",
            label: "Webhook URL",
            description: "URL for webhooks",
            type: ParamType.STRING,
            required: true,
          },
          {
            param: "DEBUG_MODE",
            label: "Debug Mode",
            description: "Enable debug logging",
            type: ParamType.SELECT,
            required: false,
            options: [
              { value: "true", label: "Enabled" },
              { value: "false", label: "Disabled" },
            ],
          },
          {
            param: "SECRET_KEY",
            label: "Secret Key",
            description: "Secret key for encryption",
            type: ParamType.SECRET,
            required: true,
          },
          {
            param: "BUCKET",
            label: "Storage Bucket",
            description: "Cloud Storage bucket",
            type: ParamType.SELECT_RESOURCE,
            required: false,
          } as any,
        ],
        systemParams: [],
      };
    }

    before(() => {
      // Only mock external API calls and file system operations
      getExtensionVersionStub = sinon.stub(extensionsApi, "getExtensionVersion");
      listInstancesStub = sinon.stub(extensionsApi, "listInstances");
      readExtensionYamlStub = sinon.stub(specHelper, "readExtensionYaml");
      readPostinstallStub = sinon.stub(specHelper, "readPostinstall");
      listExtensionVersionsStub = sinon.stub(extensionsApi, "listExtensionVersions");
      readInstanceParamStub = sinon.stub(manifest, "readInstanceParam");

      // Mock file system operations
      existsSyncStub = sinon.stub(fs, "existsSync");
      readFileSyncStub = sinon.stub(fs, "readFileSync");
      mkdirSyncStub = sinon.stub(fs, "mkdirSync");
      writeFileSyncStub = sinon.stub(fs, "writeFileSync");

      // Mock firebase config
      getFirebaseConfigStub = sinon.stub(functionsConfig, "getFirebaseConfig");

      // Mock secret manager
      secretExistsStub = sinon.stub(secretManager, "secretExists");

      // Mock prompts
      promptOnceStub = sinon.stub(prompt, "promptOnce");
    });

    after(() => {
      getExtensionVersionStub.restore();
      listInstancesStub.restore();
      readExtensionYamlStub.restore();
      readPostinstallStub.restore();
      listExtensionVersionsStub.restore();
      readInstanceParamStub.restore();
      existsSyncStub.restore();
      readFileSyncStub.restore();
      mkdirSyncStub.restore();
      writeFileSyncStub.restore();
      getFirebaseConfigStub.restore();
      secretExistsStub.restore();
      grantServiceAccountAccessStub.restore();
      promptOnceStub.restore();
    });

    beforeEach(() => {
      // Reset all stubs
      sinon.resetHistory();

      // Setup default stub behaviors
      listInstancesStub.resolves([]);
      readPostinstallStub.resolves("postinstall content");
      listExtensionVersionsStub.resolves([extensionVersion("1.0.0")]);
      getFirebaseConfigStub.resolves({ projectId: "test-project" });
      readInstanceParamStub.returns({}); // Default empty params

      // Mock directory structure
      existsSyncStub.withArgs("/test/project/.env").returns(false);
      existsSyncStub.withArgs("/test/project/.env.test-project").returns(false);
      existsSyncStub.withArgs("/test/project/extensions").returns(true);
      existsSyncStub.returns(false); // Default for other paths

      mkdirSyncStub.returns(undefined);
      writeFileSyncStub.returns(undefined);

      // Mock secret manager - secrets exist and are accessible
      secretExistsStub.resolves(true);
      grantServiceAccountAccessStub.resolves();

      // Mock prompts - provide default values
      promptOnceStub.callsFake((options: any) => {
        if (options.type === "list") {
          return Promise.resolve(options.choices[0].value);
        }
        return Promise.resolve(options.default || "prompted-value");
      });
    });

    it("should resolve extension parameters through the functions pipeline", async () => {
      const extensionSpec = extensionSpecWithExpressions();
      getExtensionVersionStub.resolves({
        ...extensionVersion("1.0.0"),
        spec: extensionSpec,
      });
      readExtensionYamlStub.resolves(extensionSpec);

      // Mock readInstanceParam to return the env vars
      readInstanceParamStub.returns({
        API_KEY: "test-api-key-123",
        WEBHOOK_URL: "https://example.com/webhook",
        DEBUG_MODE: "true",
        SECRET_KEY: "projects/test-project/secrets/test-secret/versions/latest",
      });

      // Mock environment files
      existsSyncStub
        .withArgs("/test/project/extensions/test-instance.env.test-project")
        .returns(true);
      readFileSyncStub
        .withArgs("/test/project/extensions/test-instance.env.test-project", "utf8")
        .returns(
          "API_KEY=test-api-key-123\nWEBHOOK_URL=https://example.com/webhook\nDEBUG_MODE=true",
        );

      const result = await planner.want({
        projectId: "test-project",
        projectNumber: "123456789",
        aliases: ["test-alias"],
        projectDir: "/test/project",
        extensions: {
          "test-instance": "firebase/test-extension@1.0.0",
        },
        nonInteractive: true,
      });

      // Verify the parameters were resolved
      expect(result).to.have.length(1);
      expect(result[0].instanceId).to.equal("test-instance");
      expect(result[0].params).to.deep.include({
        API_KEY: "test-api-key-123",
        WEBHOOK_URL: "https://example.com/webhook",
        DEBUG_MODE: "true",
      });
    });

    it("should convert extension ${param:FOO} expressions to CEL format", async () => {
      const extensionSpec = extensionSpecWithExpressions();
      getExtensionVersionStub.resolves({
        ...extensionVersion("1.0.0"),
        spec: extensionSpec,
      });
      readExtensionYamlStub.resolves(extensionSpec);

      // Mock readInstanceParam
      readInstanceParamStub.returns({
        API_KEY: "my-key",
        WEBHOOK_URL: "https://webhook.test",
        DEBUG_MODE: "false",
        SECRET_KEY: "projects/test-project/secrets/test-secret/versions/latest",
      });

      // Provide environment values
      existsSyncStub
        .withArgs("/test/project/extensions/converter-test.env.test-project")
        .returns(true);
      readFileSyncStub
        .withArgs("/test/project/extensions/converter-test.env.test-project", "utf8")
        .returns("API_KEY=my-key\nWEBHOOK_URL=https://webhook.test\nDEBUG_MODE=false");

      const result = await planner.want({
        nonInteractive: true,
        projectId: "test-project",
        projectNumber: "123456789",
        aliases: [],
        projectDir: "/test/project",
        extensions: {
          "converter-test": "firebase/test-extension@1.0.0",
        },
      });

      // The expressions should have been converted and resolved
      expect(result[0].params.API_KEY).to.equal("my-key");
      expect(result[0].params.WEBHOOK_URL).to.equal("https://webhook.test");
      expect(result[0].params.DEBUG_MODE).to.equal("false");
    });

    it("should handle optional parameters with empty defaults", async () => {
      const extensionSpec = extensionSpecWithExpressions();
      getExtensionVersionStub.resolves({
        ...extensionVersion("1.0.0"),
        spec: extensionSpec,
      });
      readExtensionYamlStub.resolves(extensionSpec);

      // Mock readInstanceParam - only required parameters
      readInstanceParamStub.returns({
        API_KEY: "required-key",
        WEBHOOK_URL: "https://required.test",
        SECRET_KEY: "secret-value",
      });

      // Only provide required parameters
      existsSyncStub
        .withArgs("/test/project/extensions/optional-test.env.test-project")
        .returns(true);
      readFileSyncStub
        .withArgs("/test/project/extensions/optional-test.env.test-project", "utf8")
        .returns(
          "API_KEY=required-key\nWEBHOOK_URL=https://required.test\nSECRET_KEY=secret-value",
        );

      const result = await planner.want({
        nonInteractive: true,
        projectId: "test-project",
        projectNumber: "123456789",
        aliases: [],
        projectDir: "/test/project",
        extensions: {
          "optional-test": "firebase/test-extension@1.0.0",
        },
      });

      // Optional parameters should have empty string defaults
      expect(result[0].params.API_KEY).to.equal("required-key");
      expect(result[0].params.DEBUG_MODE).to.equal(""); // Optional with default ""
      expect(result[0].params.BUCKET).to.equal(""); // Optional SELECT_RESOURCE with default ""
    });

    it("should write resolved parameters to extension-specific env file", async () => {
      const extensionSpec = mockExtensionSpec();
      getExtensionVersionStub.resolves({
        ...extensionVersion("1.0.0"),
        spec: extensionSpec,
      });
      readExtensionYamlStub.resolves(extensionSpec);

      // Mock readInstanceParam - will be populated by interactive prompting
      readInstanceParamStub.returns({
        USER_PARAM: "prompted-value",
      });

      // Mock user providing values interactively (no env file exists)
      existsSyncStub
        .withArgs("/test/project/extensions/write-test.env.test-project")
        .returns(false);

      await planner.want({
        nonInteractive: true,
        projectId: "test-project",
        projectNumber: "123456789",
        aliases: [],
        projectDir: "/test/project",
        extensions: {
          "write-test": "firebase/test-extension@1.0.0",
        },
      });

      // Should have written to the extension-specific env file
      expect(writeFileSyncStub).to.have.been.calledWith(
        "/test/project/extensions/write-test.env.test-project",
        sinon.match.string,
      );
    });

    it("should handle multiple parameter types correctly", async () => {
      // Mock readInstanceParam with all parameter types
      readInstanceParamStub.returns({
        STRING_PARAM: "test-string",
        SELECT_PARAM: "option2",
        MULTISELECT_PARAM: "a,c",
        SECRET_PARAM: "projects/test-project/secrets/my-secret/versions/latest",
        RESOURCE_PARAM: "my-bucket",
      });

      const multiTypeSpec: ExtensionSpec = {
        ...extensionSpecWithExpressions(),
        params: [
          {
            param: "STRING_PARAM",
            label: "String Parameter",
            type: ParamType.STRING,
            required: true,
          },
          {
            param: "SELECT_PARAM",
            label: "Select Parameter",
            type: ParamType.SELECT,
            required: true,
            options: [
              { value: "option1", label: "Option 1" },
              { value: "option2", label: "Option 2" },
            ],
          },
          {
            param: "MULTISELECT_PARAM",
            label: "Multi-select Parameter",
            type: ParamType.MULTISELECT,
            required: true,
            options: [
              { value: "a", label: "A" },
              { value: "b", label: "B" },
              { value: "c", label: "C" },
            ],
          },
          {
            param: "SECRET_PARAM",
            label: "Secret Parameter",
            type: ParamType.SECRET,
            required: true,
          },
          {
            param: "RESOURCE_PARAM",
            label: "Resource Parameter",
            type: ParamType.SELECT_RESOURCE,
            required: true,
          } as any,
        ],
      };

      getExtensionVersionStub.resolves({
        ...extensionVersion("1.0.0"),
        spec: multiTypeSpec,
      });
      readExtensionYamlStub.resolves(multiTypeSpec);

      existsSyncStub.withArgs("/test/project/extensions/types-test.env.test-project").returns(true);
      readFileSyncStub
        .withArgs("/test/project/extensions/types-test.env.test-project", "utf8")
        .returns(
          [
            "STRING_PARAM=test-string",
            "SELECT_PARAM=option2",
            "MULTISELECT_PARAM=a,c",
            "SECRET_PARAM=projects/test-project/secrets/my-secret/versions/latest",
            "RESOURCE_PARAM=my-bucket",
          ].join("\n"),
        );

      const result = await planner.want({
        nonInteractive: true,
        projectId: "test-project",
        projectNumber: "123456789",
        aliases: [],
        projectDir: "/test/project",
        extensions: {
          "types-test": "firebase/test-extension@1.0.0",
        },
      });

      expect(result[0].params).to.deep.include({
        STRING_PARAM: "test-string",
        SELECT_PARAM: "option2",
        MULTISELECT_PARAM: "a,c",
        SECRET_PARAM: "projects/test-project/secrets/my-secret/versions/latest",
        RESOURCE_PARAM: "my-bucket",
      });
    });

    it("should handle environment variable precedence correctly", async () => {
      const extensionSpec = mockExtensionSpec();
      getExtensionVersionStub.resolves({
        ...extensionVersion("1.0.0"),
        spec: extensionSpec,
      });
      readExtensionYamlStub.resolves(extensionSpec);

      // Mock readInstanceParam - should return the most specific values
      readInstanceParamStub.returns({
        USER_PARAM: "extension-project-value",
        ANOTHER_PARAM: "extension-another",
      });

      // Mock multiple env files with different values
      existsSyncStub.withArgs("/test/project/.env").returns(true);
      existsSyncStub.withArgs("/test/project/.env.test-project").returns(true);
      existsSyncStub.withArgs("/test/project/extensions/precedence-test.env").returns(true);
      existsSyncStub
        .withArgs("/test/project/extensions/precedence-test.env.test-project")
        .returns(true);

      // Base .env file
      readFileSyncStub
        .withArgs("/test/project/.env", "utf8")
        .returns("USER_PARAM=base-value\nANOTHER_PARAM=base-another");

      // Project-specific .env file (higher precedence)
      readFileSyncStub
        .withArgs("/test/project/.env.test-project", "utf8")
        .returns("USER_PARAM=project-value");

      // Extension-specific env file (even higher precedence)
      readFileSyncStub
        .withArgs("/test/project/extensions/precedence-test.env", "utf8")
        .returns("ANOTHER_PARAM=extension-another");

      // Extension + project specific env file (highest precedence)
      readFileSyncStub
        .withArgs("/test/project/extensions/precedence-test.env.test-project", "utf8")
        .returns("USER_PARAM=extension-project-value");

      const result = await planner.want({
        nonInteractive: true,
        projectId: "test-project",
        projectNumber: "123456789",
        aliases: [],
        projectDir: "/test/project",
        extensions: {
          "precedence-test": "firebase/test-extension@1.0.0",
        },
      });

      // Should use the most specific values
      expect(result[0].params.USER_PARAM).to.equal("extension-project-value");
      expect(result[0].params.ANOTHER_PARAM).to.equal("extension-another");
    });

    it("should handle system parameters correctly", async () => {
      const extensionSpec = mockExtensionSpec();
      getExtensionVersionStub.resolves({
        ...extensionVersion("1.0.0"),
        spec: extensionSpec,
      });
      readExtensionYamlStub.resolves(extensionSpec);

      // Mock readInstanceParam with system parameters
      readInstanceParamStub.returns({
        USER_PARAM: "user-value",
        "firebaseextensions.v1beta.function/location": "europe-west1",
        "firebaseextensions.v1beta.function/memory": "512MB",
      });

      existsSyncStub
        .withArgs("/test/project/extensions/system-test.env.test-project")
        .returns(true);
      readFileSyncStub
        .withArgs("/test/project/extensions/system-test.env.test-project", "utf8")
        .returns(
          [
            "USER_PARAM=user-value",
            "firebaseextensions.v1beta.function/location=europe-west1",
            "firebaseextensions.v1beta.function/memory=512MB",
          ].join("\n"),
        );

      const result = await planner.want({
        nonInteractive: true,
        projectId: "test-project",
        projectNumber: "123456789",
        aliases: [],
        projectDir: "/test/project",
        extensions: {
          "system-test": "firebase/test-extension@1.0.0",
        },
      });

      expect(result[0].params.USER_PARAM).to.equal("user-value");
      expect(result[0].systemParams).to.deep.include({
        "firebaseextensions.v1beta.function/location": "europe-west1",
        "firebaseextensions.v1beta.function/memory": "512MB",
      });
    });
  });
});
