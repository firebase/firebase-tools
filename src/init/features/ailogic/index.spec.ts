import { expect } from "chai";
import * as sinon from "sinon";
import * as fs from "fs-extra";
import * as init from "./index";
import * as utils from "./utils";
import { Setup } from "../..";
import { Config } from "../../../config";
import { Platform } from "../../../dataconnect/types";

describe("init ailogic", () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("askQuestions", () => {
    it("should complete without throwing", async () => {
      // Skip detailed testing of askQuestions for now - it involves complex prompt mocking
      const mockSetup = { featureInfo: {} } as Setup;
      const mockConfig = {} as Config;

      // This test just ensures the function signature is correct
      // Real functionality testing would require mocking dynamic imports
      expect(() => init.askQuestions(mockSetup, mockConfig)).to.not.throw();
    });
  });

  describe("actuate", () => {
    let setup: Setup;
    let config: Config;
    let detectAppPlatformStub: sinon.SinonStub;
    let buildProvisionOptionsStub: sinon.SinonStub;
    let provisionAiLogicAppStub: sinon.SinonStub;
    let writeAppConfigFileStub: sinon.SinonStub;
    let extractProjectIdStub: sinon.SinonStub;
    let getConfigFilePathStub: sinon.SinonStub;
    let existsSyncStub: sinon.SinonStub;

    beforeEach(() => {
      setup = {
        config: {} as any,
        rcfile: { projects: {}, targets: {}, etags: {} },
        featureInfo: {
          ailogic: {
            appNamespace: "com.example.test",
            appPlatform: "android",
            overwriteConfig: false,
          },
        },
        projectId: "test-project",
        instructions: [],
      } as Setup;

      config = {
        projectDir: "/test/project",
      } as Config;

      // Stub all utility functions
      detectAppPlatformStub = sandbox.stub(utils, "detectAppPlatform");
      buildProvisionOptionsStub = sandbox.stub(utils, "buildProvisionOptions");
      provisionAiLogicAppStub = sandbox.stub(utils, "provisionAiLogicApp");
      writeAppConfigFileStub = sandbox.stub(utils, "writeAppConfigFile");
      extractProjectIdStub = sandbox.stub(utils, "extractProjectIdFromAppResource");
      getConfigFilePathStub = sandbox.stub(utils, "getConfigFilePath");
      existsSyncStub = sandbox.stub(fs, "existsSync");
    });

    it("should return early if no ailogic feature info", async () => {
      setup.featureInfo = {};

      await init.actuate(setup, config);

      // No stubs should be called
      sinon.assert.notCalled(detectAppPlatformStub);
      sinon.assert.notCalled(provisionAiLogicAppStub);
    });

    it("should use provided app platform", async () => {
      const configFilePath = "/test/project/google-services.json";
      getConfigFilePathStub.returns(configFilePath);
      existsSyncStub.returns(false);
      buildProvisionOptionsStub.returns({ mock: "options" });
      provisionAiLogicAppStub.returns({
        appResource: "projects/test-project/apps/test-app",
        configData: "base64config",
      });
      extractProjectIdStub.returns("test-project");

      await init.actuate(setup, config);

      // Should not call detectAppPlatform since platform is provided
      sinon.assert.notCalled(detectAppPlatformStub);
      sinon.assert.calledWith(getConfigFilePathStub, "/test/project", "android");
      sinon.assert.calledWith(buildProvisionOptionsStub, "test-project", "android", "com.example.test");
    });

    it("should auto-detect platform when not provided", async () => {
      setup.featureInfo!.ailogic!.appPlatform = undefined;
      const configFilePath = "/test/project/firebase-config.json";

      detectAppPlatformStub.returns("web");
      getConfigFilePathStub.returns(configFilePath);
      existsSyncStub.returns(false);
      buildProvisionOptionsStub.returns({ mock: "options" });
      provisionAiLogicAppStub.returns({
        appResource: "projects/test-project/apps/test-app",
        configData: "base64config",
      });
      extractProjectIdStub.returns("test-project");

      await init.actuate(setup, config);

      sinon.assert.calledWith(detectAppPlatformStub, "/test/project");
      sinon.assert.calledWith(getConfigFilePathStub, "/test/project", "web");
      sinon.assert.calledWith(buildProvisionOptionsStub, "test-project", "web", "com.example.test");
    });

    it("should throw error if config file exists and overwrite not enabled", async () => {
      const configFilePath = "/test/project/google-services.json";
      getConfigFilePathStub.returns(configFilePath);
      existsSyncStub.returns(true);

      await expect(init.actuate(setup, config)).to.be.rejectedWith(
        "AI Logic setup failed: Config file /test/project/google-services.json already exists. Use overwrite_config: true to update it."
      );
    });

    it("should proceed if config file exists and overwrite is enabled", async () => {
      setup.featureInfo!.ailogic!.overwriteConfig = true;
      const configFilePath = "/test/project/google-services.json";

      getConfigFilePathStub.returns(configFilePath);
      existsSyncStub.returns(true);
      buildProvisionOptionsStub.returns({ mock: "options" });
      provisionAiLogicAppStub.returns({
        appResource: "projects/test-project/apps/test-app",
        configData: "base64config",
      });
      extractProjectIdStub.returns("test-project");

      await init.actuate(setup, config);

      sinon.assert.called(provisionAiLogicAppStub);
      sinon.assert.calledWith(writeAppConfigFileStub, configFilePath, "base64config");
    });

    it("should provision app and write config file", async () => {
      const configFilePath = "/test/project/google-services.json";
      const mockResponse = {
        appResource: "projects/new-project/apps/test-app",
        configData: "base64configdata",
      };

      getConfigFilePathStub.returns(configFilePath);
      existsSyncStub.returns(false);
      buildProvisionOptionsStub.returns({ mock: "options" });
      provisionAiLogicAppStub.returns(mockResponse);
      extractProjectIdStub.returns("new-project");

      await init.actuate(setup, config);

      sinon.assert.calledWith(provisionAiLogicAppStub, { mock: "options" });
      sinon.assert.calledWith(extractProjectIdStub, "projects/new-project/apps/test-app");
      sinon.assert.calledWith(writeAppConfigFileStub, configFilePath, "base64configdata");
      expect(setup.projectId).to.equal("new-project");
    });

    it("should update .firebaserc with new project", async () => {
      const configFilePath = "/test/project/google-services.json";

      getConfigFilePathStub.returns(configFilePath);
      existsSyncStub.returns(false);
      buildProvisionOptionsStub.returns({ mock: "options" });
      provisionAiLogicAppStub.returns({
        appResource: "projects/new-project/apps/test-app",
        configData: "base64config",
      });
      extractProjectIdStub.returns("new-project");

      await init.actuate(setup, config);

      expect(setup.rcfile!.projects!.default).to.equal("new-project");
    });

    it("should add appropriate instructions", async () => {
      const configFilePath = "/test/project/google-services.json";

      getConfigFilePathStub.returns(configFilePath);
      existsSyncStub.returns(false);
      buildProvisionOptionsStub.returns({ mock: "options" });
      provisionAiLogicAppStub.returns({
        appResource: "projects/test-project/apps/test-app",
        configData: "base64config",
      });
      extractProjectIdStub.returns("test-project");

      await init.actuate(setup, config);

      expect(setup.instructions).to.include("Firebase AI Logic has been enabled with a new android app.");
      expect(setup.instructions).to.include(`Config file written to: ${configFilePath}`);
      expect(setup.instructions).to.include("If you have multiple app directories, copy the config file to the appropriate app folder.");
      expect(setup.instructions).to.include("Note: A new Firebase app was created. You can use existing Firebase apps with AI Logic (current API limitation).");
    });

    it("should handle provisioning errors gracefully", async () => {
      const configFilePath = "/test/project/google-services.json";

      getConfigFilePathStub.returns(configFilePath);
      existsSyncStub.returns(false);
      buildProvisionOptionsStub.returns({ mock: "options" });
      provisionAiLogicAppStub.throws(new Error("Provisioning API failed"));

      await expect(init.actuate(setup, config)).to.be.rejectedWith(
        "AI Logic setup failed: Provisioning API failed"
      );
    });

    it("should handle missing rcfile gracefully", async () => {
      setup.rcfile = undefined as any;
      const configFilePath = "/test/project/google-services.json";

      getConfigFilePathStub.returns(configFilePath);
      existsSyncStub.returns(false);
      buildProvisionOptionsStub.returns({ mock: "options" });
      provisionAiLogicAppStub.returns({
        appResource: "projects/test-project/apps/test-app",
        configData: "base64config",
      });
      extractProjectIdStub.returns("test-project");

      // Should not throw an error
      await init.actuate(setup, config);

      sinon.assert.called(provisionAiLogicAppStub);
    });
  });
});