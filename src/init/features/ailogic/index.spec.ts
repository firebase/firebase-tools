import * as prompt from "../../../prompt";
import { expect } from "chai";
import * as sinon from "sinon";
import * as init from "./index";
import * as utils from "./utils";
import * as apps from "../../../management/apps";
import * as provision from "../../../management/provisioning/provision";
import { Setup } from "../..";
import { AppPlatform } from "../../../management/apps";

describe("init ailogic", () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("askQuestions", () => {
    let listFirebaseAppsStub: sinon.SinonStub;
    let selectStub: sinon.SinonStub;

    beforeEach(() => {
      listFirebaseAppsStub = sandbox.stub(apps, "listFirebaseApps");
      selectStub = sandbox.stub(prompt, "select");
    });

    it("should populate ailogic featureInfo with selected app ID", async () => {
      const mockApps = [
        {
          appId: "1:123456789:android:abcdef123456",
          displayName: "Test Android App",
          platform: AppPlatform.ANDROID,
        },
        {
          appId: "1:123456789:web:fedcba654321",
          displayName: "Test Web App",
          platform: AppPlatform.WEB,
        },
      ];
      const mockSetup = { projectId: "test-project" } as Setup;

      listFirebaseAppsStub.resolves(mockApps);
      selectStub.resolves(mockApps[0]); // Select first app

      await init.askQuestions(mockSetup);

      expect(mockSetup.featureInfo).to.have.property("ailogic");
      expect(mockSetup.featureInfo?.ailogic).to.deep.equal({
        appId: "1:123456789:android:abcdef123456",
      });
    });

    it("should throw error when no project ID is found", async () => {
      const mockSetup = {} as Setup; // No projectId

      await expect(init.askQuestions(mockSetup)).to.be.rejectedWith(
        "No project ID found. Please ensure you are in a Firebase project directory or specify a project.",
      );

      sinon.assert.notCalled(listFirebaseAppsStub);
      sinon.assert.notCalled(selectStub);
    });

    it("should throw error when no apps are found", async () => {
      const mockSetup = { projectId: "test-project" } as Setup;
      listFirebaseAppsStub.resolves([]); // No apps

      await expect(init.askQuestions(mockSetup)).to.be.rejectedWith(
        "No Firebase apps found in this project. Please create an app first using the Firebase Console or 'firebase apps:create'.",
      );

      sinon.assert.calledWith(listFirebaseAppsStub, "test-project", AppPlatform.ANY);
      sinon.assert.notCalled(selectStub);
    });
  });

  describe("actuate", () => {
    let setup: Setup;
    let parseAppIdStub: sinon.SinonStub;
    let provisionFirebaseAppStub: sinon.SinonStub;
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

      // Stub only the functions used in actuate (no validation stubs)
      parseAppIdStub = sandbox.stub(utils, "parseAppId");
      provisionFirebaseAppStub = sandbox.stub(provision, "provisionFirebaseApp");
      getConfigFileNameStub = sandbox.stub(utils, "getConfigFileName");
    });

    it("should return early if no ailogic feature info", async () => {
      setup.featureInfo = {};

      await init.actuate(setup);

      // No stubs should be called
      sinon.assert.notCalled(parseAppIdStub);
      sinon.assert.notCalled(provisionFirebaseAppStub);
    });

    it("should provision existing app successfully", async () => {
      const mockAppInfo = {
        projectNumber: "123456789",
        appId: "1:123456789:android:abcdef123456",
        platform: AppPlatform.ANDROID,
      };
      const mockConfigContent = '{"config": "content"}';
      const base64Config = Buffer.from(mockConfigContent).toString("base64");

      parseAppIdStub.returns(mockAppInfo);
      provisionFirebaseAppStub.resolves({ configData: base64Config });
      getConfigFileNameStub.returns("google-services.json");

      await init.actuate(setup);

      sinon.assert.calledWith(parseAppIdStub, "1:123456789:android:abcdef123456");
      sinon.assert.calledOnce(provisionFirebaseAppStub);

      expect(setup.instructions).to.include(
        "Firebase AI Logic has been enabled for existing ANDROID app: 1:123456789:android:abcdef123456",
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
      sinon.assert.notCalled(provisionFirebaseAppStub);
    });

    it("should handle provisioning errors gracefully", async () => {
      const mockAppInfo = {
        projectNumber: "123456789",
        appId: "1:123456789:android:abcdef123456",
        platform: AppPlatform.ANDROID,
      };

      parseAppIdStub.returns(mockAppInfo);
      provisionFirebaseAppStub.throws(new Error("Provisioning API failed"));

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
        platform: AppPlatform.IOS,
      };
      const mockConfigContent = '<?xml version="1.0" encoding="UTF-8"?>';
      const base64Config = Buffer.from(mockConfigContent).toString("base64");

      parseAppIdStub.returns(mockAppInfo);
      provisionFirebaseAppStub.resolves({ configData: base64Config });
      getConfigFileNameStub.returns("GoogleService-Info.plist");

      await init.actuate(setup);

      expect(setup.instructions).to.include(
        "Firebase AI Logic has been enabled for existing IOS app: 1:123456789:ios:abcdef123456",
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
        platform: AppPlatform.ANDROID,
      };
      const mockConfigContent = '{"config": "content"}';
      const base64Config = Buffer.from(mockConfigContent).toString("base64");

      parseAppIdStub.returns(mockAppInfo);
      provisionFirebaseAppStub.resolves({ configData: base64Config });
      getConfigFileNameStub.returns("google-services.json");

      await init.actuate(setup);

      expect(setup.instructions).to.include(
        "Place this config file in the appropriate location for your platform.",
      );
    });
  });
});
