import * as prompt from "../../../prompt";
import { expect } from "chai";
import * as sinon from "sinon";
import * as init from "./index";
import * as utils from "./utils";
import * as projects from "../../../management/projects";
import { Setup } from "../..";

describe("init ailogic", () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("askQuestions", () => {
    let inputStub: sinon.SinonStub;

    beforeEach(() => {
      inputStub = sandbox.stub(prompt, "input");
    });

    it("should populate ailogic featureInfo with valid app ID", async () => {
      inputStub.resolves("1:123456789:android:abcdef123456"); // Valid Android app ID
      const mockSetup = {} as Setup;
      await init.askQuestions(mockSetup);

      expect(mockSetup.featureInfo).to.have.property("ailogic");
      expect(mockSetup.featureInfo?.ailogic).to.deep.equal({
        appId: "1:123456789:android:abcdef123456",
      });
    });

    it("should validate app ID format and reject invalid format", async () => {
      // Mock the input function to simulate user input and validation
      let validationFunction: ((input: string) => string | boolean) | undefined;
      inputStub.callsFake(async (options: { validate?: (input: string) => string | boolean }) => {
        validationFunction = options.validate;
        return "1:123456789:web:abcdef123456"; // Return valid app ID after validation
      });

      const mockSetup = {} as Setup;
      await init.askQuestions(mockSetup);

      // Test the validation function directly
      if (validationFunction) {
        expect(validationFunction("")).to.equal("Please enter a Firebase app ID");
        expect(validationFunction("invalid-format")).to.equal(
          "Invalid app ID format. Expected: 1:PROJECT_NUMBER:PLATFORM:APP_ID (e.g., 1:123456789:web:abcdef123456)",
        );
        expect(validationFunction("1:123456789:flutter:abcdef")).to.equal(
          "Invalid app ID format. Expected: 1:PROJECT_NUMBER:PLATFORM:APP_ID (e.g., 1:123456789:web:abcdef123456)",
        );
        expect(validationFunction("1:123456789:web:abcdef123456")).to.equal(true);
      }
    });
  });

  describe("actuate", () => {
    let setup: Setup;
    let parseAppIdStub: sinon.SinonStub;
    let getFirebaseProjectStub: sinon.SinonStub;
    let validateProjectNumberMatchStub: sinon.SinonStub;
    let validateAppExistsStub: sinon.SinonStub;
    let buildProvisionOptionsStub: sinon.SinonStub;
    let provisionAiLogicAppStub: sinon.SinonStub;
    let getConfigFileNameStub: sinon.SinonStub;

    beforeEach(() => {
      setup = {
        config: {},
        rcfile: { projects: {}, targets: {}, etags: {} },
        featureInfo: {
          ailogic: {
            appId: "1:123456789:android:abcdef123456",
          },
        },
        projectId: "test-project",
        instructions: [],
      } as Setup;

      // Stub all utility functions
      parseAppIdStub = sandbox.stub(utils, "parseAppId");
      getFirebaseProjectStub = sandbox.stub(projects, "getFirebaseProject");
      validateProjectNumberMatchStub = sandbox.stub(utils, "validateProjectNumberMatch");
      validateAppExistsStub = sandbox.stub(utils, "validateAppExists");
      buildProvisionOptionsStub = sandbox.stub(utils, "buildProvisionOptions");
      provisionAiLogicAppStub = sandbox.stub(utils, "provisionAiLogicApp");
      getConfigFileNameStub = sandbox.stub(utils, "getConfigFileName");
    });

    it("should return early if no ailogic feature info", async () => {
      setup.featureInfo = {};

      await init.actuate(setup);

      // No stubs should be called
      sinon.assert.notCalled(parseAppIdStub);
      sinon.assert.notCalled(provisionAiLogicAppStub);
    });

    it("should validate and provision existing app successfully", async () => {
      const mockAppInfo = {
        projectNumber: "123456789",
        appId: "1:123456789:android:abcdef123456",
        platform: "android" as const,
      };
      const mockProjectInfo = {
        projectNumber: "123456789",
        projectId: "test-project",
        name: "projects/test-project",
        displayName: "Test Project",
      };
      const mockConfigContent = '{"config": "content"}';
      const base64Config = Buffer.from(mockConfigContent).toString("base64");

      parseAppIdStub.returns(mockAppInfo);
      getFirebaseProjectStub.resolves(mockProjectInfo);
      validateAppExistsStub.resolves();
      buildProvisionOptionsStub.returns({ mock: "options" });
      provisionAiLogicAppStub.resolves({ configData: base64Config });
      getConfigFileNameStub.returns("google-services.json");

      await init.actuate(setup);

      sinon.assert.calledWith(parseAppIdStub, "1:123456789:android:abcdef123456");
      sinon.assert.calledWith(getFirebaseProjectStub, "test-project");
      sinon.assert.calledWith(validateProjectNumberMatchStub, mockAppInfo, mockProjectInfo);
      sinon.assert.calledWith(validateAppExistsStub, mockAppInfo);
      sinon.assert.calledWith(
        buildProvisionOptionsStub,
        "test-project",
        "android",
        "1:123456789:android:abcdef123456",
      );

      expect(setup.instructions).to.include(
        "Firebase AI Logic has been enabled for existing android app: 1:123456789:android:abcdef123456",
      );
      expect(setup.instructions).to.include(
        "Save the following content as google-services.json in your app's root directory:",
      );
      expect(setup.instructions).to.include(mockConfigContent);
    });

    it("should throw error if no project ID found", async () => {
      setup.projectId = undefined;

      await expect(init.actuate(setup)).to.be.rejectedWith(
        "AI Logic setup failed: No project ID found. Please ensure you are in a Firebase project directory or specify a project.",
      );

      sinon.assert.calledOnce(parseAppIdStub);
      sinon.assert.notCalled(getFirebaseProjectStub);
    });

    it("should handle project number mismatch error", async () => {
      const mockAppInfo = {
        projectNumber: "123456789",
        appId: "1:123456789:android:abcdef123456",
        platform: "android" as const,
      };
      const mockProjectInfo = {
        projectNumber: "987654321",
        projectId: "test-project",
        name: "projects/test-project",
        displayName: "Test Project",
      };

      parseAppIdStub.returns(mockAppInfo);
      getFirebaseProjectStub.resolves(mockProjectInfo);
      validateProjectNumberMatchStub.throws(new Error("Project number mismatch"));

      await expect(init.actuate(setup)).to.be.rejectedWith(
        "AI Logic setup failed: Project number mismatch",
      );

      sinon.assert.calledWith(validateProjectNumberMatchStub, mockAppInfo, mockProjectInfo);
      sinon.assert.notCalled(validateAppExistsStub);
    });

    it("should handle app validation error", async () => {
      const mockAppInfo = {
        projectNumber: "123456789",
        appId: "1:123456789:android:abcdef123456",
        platform: "android" as const,
      };
      const mockProjectInfo = {
        projectNumber: "123456789",
        projectId: "test-project",
        name: "projects/test-project",
        displayName: "Test Project",
      };

      parseAppIdStub.returns(mockAppInfo);
      getFirebaseProjectStub.resolves(mockProjectInfo);
      validateAppExistsStub.throws(new Error("App does not exist"));

      await expect(init.actuate(setup)).to.be.rejectedWith(
        "AI Logic setup failed: App does not exist",
      );

      sinon.assert.calledWith(validateAppExistsStub, mockAppInfo);
      sinon.assert.notCalled(buildProvisionOptionsStub);
    });

    it("should handle provisioning errors gracefully", async () => {
      const mockAppInfo = {
        projectNumber: "123456789",
        appId: "1:123456789:android:abcdef123456",
        platform: "android" as const,
      };
      const mockProjectInfo = {
        projectNumber: "123456789",
        projectId: "test-project",
        name: "projects/test-project",
        displayName: "Test Project",
      };

      parseAppIdStub.returns(mockAppInfo);
      getFirebaseProjectStub.resolves(mockProjectInfo);
      validateAppExistsStub.resolves();
      buildProvisionOptionsStub.returns({ mock: "options" });
      provisionAiLogicAppStub.throws(new Error("Provisioning API failed"));

      await expect(init.actuate(setup)).to.be.rejectedWith(
        "AI Logic setup failed: Provisioning API failed",
      );
    });

    it("should include config file content in instructions for iOS", async () => {
      if (setup.featureInfo?.ailogic) {
        setup.featureInfo.ailogic.appId = "1:123456789:ios:abcdef123456";
      }
      const mockAppInfo = {
        projectNumber: "123456789",
        appId: "1:123456789:ios:abcdef123456",
        platform: "ios" as const,
      };
      const mockProjectInfo = {
        projectNumber: "123456789",
        projectId: "test-project",
        name: "projects/test-project",
        displayName: "Test Project",
      };
      const mockConfigContent = '<?xml version="1.0" encoding="UTF-8"?>';
      const base64Config = Buffer.from(mockConfigContent).toString("base64");

      parseAppIdStub.returns(mockAppInfo);
      getFirebaseProjectStub.resolves(mockProjectInfo);
      validateAppExistsStub.resolves();
      buildProvisionOptionsStub.returns({ mock: "options" });
      provisionAiLogicAppStub.resolves({ configData: base64Config });
      getConfigFileNameStub.returns("GoogleService-Info.plist");

      await init.actuate(setup);

      expect(setup.instructions).to.include(
        "Firebase AI Logic has been enabled for existing ios app: 1:123456789:ios:abcdef123456",
      );
      expect(setup.instructions).to.include(
        "Save the following content as GoogleService-Info.plist in your app's root directory:",
      );
      expect(setup.instructions).to.include(mockConfigContent);
    });

    it("should include platform placement guidance in instructions", async () => {
      const mockAppInfo = {
        projectNumber: "123456789",
        appId: "1:123456789:android:abcdef123456",
        platform: "android" as const,
      };
      const mockProjectInfo = {
        projectNumber: "123456789",
        projectId: "test-project",
        name: "projects/test-project",
        displayName: "Test Project",
      };
      const mockConfigContent = '{"config": "content"}';
      const base64Config = Buffer.from(mockConfigContent).toString("base64");

      parseAppIdStub.returns(mockAppInfo);
      getFirebaseProjectStub.resolves(mockProjectInfo);
      validateAppExistsStub.resolves();
      buildProvisionOptionsStub.returns({ mock: "options" });
      provisionAiLogicAppStub.resolves({ configData: base64Config });
      getConfigFileNameStub.returns("google-services.json");

      await init.actuate(setup);

      expect(setup.instructions).to.include(
        "Place this config file in the appropriate location for your platform.",
      );
    });
  });
});
