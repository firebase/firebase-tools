import { expect } from "chai";
import * as sinon from "sinon";

import * as utils from "../../../emulator/extensions/validation";
import * as ensureApiEnabled from "../../../ensureApiEnabled";
import { InstanceSpec } from "../../../deploy/extensions/planner";

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

describe("ExtensionsEmulator validation utils", () => {
  describe(`${utils.getUnemulatedAPIs.name}`, () => {
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

      const result = await utils.getUnemulatedAPIs(testProjectId, [
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
});
