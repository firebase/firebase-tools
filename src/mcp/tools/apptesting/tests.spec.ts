import { expect } from "chai";
import * as sinon from "sinon";
import { run_tests, check_status } from "./tests";
import * as distribution from "../../../appdistribution/distribution";
import { AppDistributionClient } from "../../../appdistribution/client";
import * as appTesting from "../../../gcp/apptesting";
import { McpContext } from "../../types";
import { safeLoad } from "js-yaml";
import * as fs from "fs-extra";
import * as path from "path";

describe("mcp/tools/apptesting/tests", () => {
  let sandbox: sinon.SinonSandbox;
  let clientStub: sinon.SinonStubbedInstance<AppDistributionClient>;
  let uploadStub: sinon.SinonStub;
  let testEnvironmentCatalogStub: sinon.SinonStub;
  const dummyPath = path.join(__dirname, "test-dummy.apk");

  const mockContext: McpContext = {
    projectId: "test-project",
  } as any;

  before(() => {
    fs.ensureFileSync(dummyPath);
  });

  after(() => {
    fs.removeSync(dummyPath);
  });

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    clientStub = sandbox.createStubInstance(AppDistributionClient);

    // Stub prototype methods to DELEGATE to the stub instance methods
    // matches args type: (...args: any[]) => any
    sandbox
      .stub(AppDistributionClient.prototype, "getReleaseTest")
      .callsFake(clientStub.getReleaseTest as any);
    sandbox
      .stub(AppDistributionClient.prototype, "createReleaseTest")
      .callsFake(clientStub.createReleaseTest as any);

    uploadStub = sandbox.stub(distribution, "upload");
    testEnvironmentCatalogStub = sandbox.stub(appTesting, "testEnvironmentCatalog");
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("run_tests", () => {
    it("should upload release and create release test", async () => {
      const input = {
        appId: "1:123:android:abc",
        releaseBinaryFile: dummyPath,
        testCase: { steps: [{ goal: "test goal" }] },
        testDevices: [
          { model: "test-model", version: "30", locale: "en", orientation: "portrait" },
        ],
      };

      const releaseName = "projects/test-project/apps/app-id/releases/release-id";
      const expectedResponse = {
        name: "test-run-id",
        displayName: "Test Run",
      };

      uploadStub.resolves(releaseName);
      clientStub.createReleaseTest.resolves(expectedResponse as any);

      const result = await run_tests.fn(input, mockContext);

      expect(uploadStub.called).to.be.true;
      expect(
        clientStub.createReleaseTest.calledWith(releaseName, input.testDevices, input.testCase),
      ).to.be.true;

      const resultText = (result.content[0] as any).text;
      const resultObj = safeLoad(resultText);
      expect(resultObj).to.deep.equal(expectedResponse);
    });

    it("should use default devices if not provided", async () => {
      const input = {
        appId: "1:123:android:abc",
        releaseBinaryFile: dummyPath,
        testCase: { steps: [{ goal: "test goal" }] },
      };

      uploadStub.resolves("release-name");
      clientStub.createReleaseTest.resolves({} as any);

      await run_tests.fn(input as any, mockContext);

      // Verify the method was called with default devices
      // Args: [releaseName, devices, testCase]
      // devices should have 1 item
      const args = clientStub.createReleaseTest.firstCall.args;
      expect(args[1]).to.have.lengthOf(1); // Default device list has 1 device
      expect(args[1][0].model).to.equal("MediumPhone.arm");
    });
  });

  describe("check_status", () => {
    it("should fetch release test if release_test_name is provided", async () => {
      const input = { release_test_name: "param/to/test" };
      const expectedTest = { name: "test-id", status: "IN_PROGRESS" };

      clientStub.getReleaseTest.resolves(expectedTest as any);

      const result = await check_status.fn(input, mockContext);

      expect(clientStub.getReleaseTest.calledWith(input.release_test_name)).to.be.true;

      const resultText = (result.content[0] as any).text;
      const resultObj = safeLoad(resultText);
      expect(resultObj).to.deep.include({
        releaseTest: expectedTest,
      });
    });

    it("should fetch available devices if getAvailableDevices is true", async () => {
      const input = { getAvailableDevices: true };
      const expectedDevices = [{ model: "pixel" }];

      testEnvironmentCatalogStub.resolves(expectedDevices);

      const result = await check_status.fn(input, mockContext);

      expect(testEnvironmentCatalogStub.calledWith(mockContext.projectId, "ANDROID")).to.be.true;

      const resultText = (result.content[0] as any).text;
      const resultObj = safeLoad(resultText);
      expect(resultObj).to.deep.include({
        devices: expectedDevices,
      });
    });

    it("should handle both options", async () => {
      const input = { release_test_name: "test-id", getAvailableDevices: true };

      clientStub.getReleaseTest.resolves({ name: "test" } as any);
      testEnvironmentCatalogStub.resolves([]);

      await check_status.fn(input, mockContext);

      expect(clientStub.getReleaseTest.called).to.be.true;
      expect(testEnvironmentCatalogStub.called).to.be.true;
    });
  });
});
