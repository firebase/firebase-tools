import { expect } from "chai";
import * as sinon from "sinon";

import * as validation from "../../../emulator/extensions/validation";
import * as ensureApiEnabled from "../../../ensureApiEnabled";
import * as controller from "../../../emulator/controller";
import { InstanceSpec } from "../../../deploy/extensions/planner";
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
function getTestInstanceSpecWithAPI(instanceId: string, apiName: string): InstanceSpec {
  return {
    instanceId,
    params: {},
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
        apis: [{ apiName, reason: "because" }],
      },
    },
  };
}

function testEmulatableBackend(predefinedTriggers: ParsedTriggerDefinition[]): EmulatableBackend {
  return {
    functionsDir: ".",
    env: {},
    predefinedTriggers,
  };
}

function testParsedTriggerDefinition(args: {
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

describe("ExtensionsEmulator validation validation", () => {
  describe(`${validation.getUnemulatedAPIs.name}`, () => {
    const testProjectId = "test-project";
    const testAPI = "test.googleapis.com";
    const sandbox = sinon.createSandbox();

    beforeEach(() => {
      const checkStub = sandbox.stub(ensureApiEnabled, "check");
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
        getTestInstanceSpecWithAPI(instanceIdWithEmulatedAPI, "firestore.googleapis.com"),
        getTestInstanceSpecWithAPI(instanceIdWithUnemulatedAPI, testAPI),
        getTestInstanceSpecWithAPI(instanceId2WithUnemulatedAPI, testAPI),
      ]);

      expect(result).to.deep.equal([
        {
          apiName: testAPI,
          instanceIds: [instanceIdWithUnemulatedAPI, instanceId2WithUnemulatedAPI],
          enabled: true,
        },
      ]);
    });
  });

  describe(`${validation.checkForUnemulatedTriggerTypes.name}`, () => {
    const sandbox = sinon.createSandbox();

    beforeEach(() => {
      const shouldStartStub = sandbox.stub(controller, "shouldStart");
      shouldStartStub.withArgs(sinon.match.any, Emulators.STORAGE).returns(true);
      shouldStartStub.withArgs(sinon.match.any, Emulators.DATABASE).returns(true);
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
          testParsedTriggerDefinition({
            eventTrigger: {
              resource: "test/{*}",
              eventType: "providers/cloud.firestore/eventTypes/document.create",
            },
          }),
          testParsedTriggerDefinition({
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
          testParsedTriggerDefinition({
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
          testParsedTriggerDefinition({
            eventTrigger: {
              resource: "test/{*}",
              eventType: "providers/cloud.firestore/eventTypes/document.create",
            },
          }),
          testParsedTriggerDefinition({
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
          testParsedTriggerDefinition({
            eventTrigger: {
              resource: "test/{*}",
              eventType: "google.storage.object.finalize",
            },
          }),
          testParsedTriggerDefinition({
            eventTrigger: {
              resource: "test/{*}",
              eventType: "providers/google.firebase.database/eventTypes/ref.write",
            },
          }),
        ],
        want: [],
      },
      {
        desc: "should not return trigger types for https triggers",
        input: [
          testParsedTriggerDefinition({
            httpsTrigger: {},
          }),
        ],
        want: [],
      },
    ];

    for (const test of tests) {
      it(test.desc, () => {
        const result = validation.checkForUnemulatedTriggerTypes(
          TEST_OPTIONS,
          testEmulatableBackend(test.input)
        );

        expect(result).to.have.members(test.want);
      });
    }
  });
});
