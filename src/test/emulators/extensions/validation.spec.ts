import { expect } from "chai";
import * as sinon from "sinon";

import * as validation from "../../../emulator/extensions/validation";
import * as ensureApiEnabled from "../../../ensureApiEnabled";
import * as controller from "../../../emulator/controller";
import { DeploymentInstanceSpec } from "../../../deploy/extensions/planner";
import { EmulatableBackend } from "../../../emulator/functionsEmulator";
import { Emulators } from "../../../emulator/types";
import { EventTrigger, ParsedTriggerDefinition } from "../../../emulator/functionsEmulatorShared";
import { Options } from "../../../options";
import { RC } from "../../../rc";
import { Config } from "../../../config";

const TEST_OPTIONS: Options = {
  cwd: ".",
  configPath: ".",
  only: "",
  except: "",
  force: false,
  filteredTargets: [""],
  nonInteractive: true,
  interactive: false,
  json: false,
  debug: false,
  rc: new RC(),
  config: new Config("."),
};
function fakeInstanceSpecWithAPI(instanceId: string, apiName: string): DeploymentInstanceSpec {
  return {
    instanceId,
    params: {},
    systemParams: {},
    ref: {
      publisherId: "test",
      extensionId: "test",
      version: "0.1.0",
    },
    extensionVersion: {
      name: "publishers/test/extensions/test/versions/0.1.0",
      ref: "test/test@0.1.0",
      state: "PUBLISHED",
      sourceDownloadUri: "test.com",
      hash: "abc123",
      spec: {
        name: "test",
        version: "0.1.0",
        sourceUrl: "test.com",
        resources: [],
        params: [],
        systemParams: [],
        apis: [{ apiName, reason: "because" }],
      },
    },
  };
}

function getTestEmulatableBackend(
  predefinedTriggers: ParsedTriggerDefinition[],
): EmulatableBackend {
  return {
    functionsDir: ".",
    env: {},
    secretEnv: [],
    codebase: "",
    predefinedTriggers,
  };
}

function getTestParsedTriggerDefinition(args: {
  httpsTrigger?: {};
  eventTrigger?: EventTrigger;
}): ParsedTriggerDefinition {
  return {
    entryPoint: "test",
    platform: "gcfv1",
    name: "test",
    eventTrigger: args.eventTrigger,
    httpsTrigger: args.httpsTrigger,
  };
}

describe("ExtensionsEmulator validation", () => {
  describe(`${validation.getUnemulatedAPIs.name}`, () => {
    const testProjectId = "test-project";
    const testAPI = "test.googleapis.com";
    const sandbox = sinon.createSandbox();
    let checkStub: sinon.SinonStub;

    beforeEach(() => {
      checkStub = sandbox.stub(ensureApiEnabled, "check");
      checkStub.withArgs(testProjectId, testAPI, "extensions", true).resolves(true);
      checkStub.throws("Unexpected API checked in test");
    });

    afterEach(() => {
      sandbox.restore();
    });

    it("should check only unemulated APIs", async () => {
      const instanceIdWithUnemulatedAPI = "unemulated";
      const instanceId2WithUnemulatedAPI = "unemulated2";
      const instanceIdWithEmulatedAPI = "emulated";

      const result = await validation.getUnemulatedAPIs(testProjectId, [
        fakeInstanceSpecWithAPI(instanceIdWithEmulatedAPI, "firestore.googleapis.com"),
        fakeInstanceSpecWithAPI(instanceIdWithUnemulatedAPI, testAPI),
        fakeInstanceSpecWithAPI(instanceId2WithUnemulatedAPI, testAPI),
      ]);

      expect(result).to.deep.equal([
        {
          apiName: testAPI,
          instanceIds: [instanceIdWithUnemulatedAPI, instanceId2WithUnemulatedAPI],
          enabled: true,
        },
      ]);
    });

    it("should not check on demo- projects", async () => {
      const instanceIdWithUnemulatedAPI = "unemulated";
      const instanceId2WithUnemulatedAPI = "unemulated2";
      const instanceIdWithEmulatedAPI = "emulated";

      const result = await validation.getUnemulatedAPIs(`demo-${testProjectId}`, [
        fakeInstanceSpecWithAPI(instanceIdWithEmulatedAPI, "firestore.googleapis.com"),
        fakeInstanceSpecWithAPI(instanceIdWithUnemulatedAPI, testAPI),
        fakeInstanceSpecWithAPI(instanceId2WithUnemulatedAPI, testAPI),
      ]);

      expect(result).to.deep.equal([
        {
          apiName: testAPI,
          instanceIds: [instanceIdWithUnemulatedAPI, instanceId2WithUnemulatedAPI],
          enabled: false,
        },
      ]);
      expect(checkStub.callCount).to.equal(0);
    });
  });

  describe(`${validation.checkForUnemulatedTriggerTypes.name}`, () => {
    const sandbox = sinon.createSandbox();

    beforeEach(() => {
      const shouldStartStub = sandbox.stub(controller, "shouldStart");
      shouldStartStub.withArgs(sinon.match.any, Emulators.STORAGE).returns(true);
      shouldStartStub.withArgs(sinon.match.any, Emulators.DATABASE).returns(true);
      shouldStartStub.withArgs(sinon.match.any, Emulators.EVENTARC).returns(true);
      shouldStartStub.withArgs(sinon.match.any, Emulators.FIRESTORE).returns(false);
      shouldStartStub.withArgs(sinon.match.any, Emulators.AUTH).returns(false);
    });

    afterEach(() => {
      sandbox.restore();
    });

    const tests: {
      desc: string;
      input: ParsedTriggerDefinition[];
      want: string[];
    }[] = [
      {
        desc: "should return trigger types for emulators that are not running",
        input: [
          getTestParsedTriggerDefinition({
            eventTrigger: {
              resource: "test/{*}",
              eventType: "providers/cloud.firestore/eventTypes/document.create",
            },
          }),
          getTestParsedTriggerDefinition({
            eventTrigger: {
              resource: "test",
              eventType: "providers/firebase.auth/eventTypes/user.create",
            },
          }),
        ],
        want: ["firestore", "auth"],
      },
      {
        desc: "should return trigger types that don't have an emulator",
        input: [
          getTestParsedTriggerDefinition({
            eventTrigger: {
              resource: "test",
              eventType: "providers/google.firebase.analytics/eventTypes/event.log",
            },
          }),
        ],
        want: ["analytics"],
      },
      {
        desc: "should not return duplicates",
        input: [
          getTestParsedTriggerDefinition({
            eventTrigger: {
              resource: "test/{*}",
              eventType: "providers/cloud.firestore/eventTypes/document.create",
            },
          }),
          getTestParsedTriggerDefinition({
            eventTrigger: {
              resource: "test/{*}",
              eventType: "providers/cloud.firestore/eventTypes/document.create",
            },
          }),
        ],
        want: ["firestore"],
      },
      {
        desc: "should not return trigger types for emulators that are running",
        input: [
          getTestParsedTriggerDefinition({
            eventTrigger: {
              resource: "test/{*}",
              eventType: "google.storage.object.finalize",
            },
          }),
          getTestParsedTriggerDefinition({
            eventTrigger: {
              resource: "test/{*}",
              eventType: "providers/google.firebase.database/eventTypes/ref.write",
            },
          }),
          getTestParsedTriggerDefinition({
            eventTrigger: {
              eventType: "test.custom.event",
              channel: "projects/foo/locations/us-central1/channels/firebase",
            },
          }),
        ],
        want: [],
      },
      {
        desc: "should not return trigger types for https triggers",
        input: [
          getTestParsedTriggerDefinition({
            httpsTrigger: {},
          }),
        ],
        want: [],
      },
    ];

    for (const test of tests) {
      it(test.desc, () => {
        const result = validation.checkForUnemulatedTriggerTypes(
          getTestEmulatableBackend(test.input),
          TEST_OPTIONS,
        );

        expect(result).to.have.members(test.want);
      });
    }
  });
});
