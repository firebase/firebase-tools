import { expect } from "chai";
import * as sinon from "sinon";
import * as utils from "./utils";
import * as provision from "../../../management/provisioning/provision";
import * as apps from "../../../management/apps";
import { AppPlatform } from "../../../management/apps";
import { FirebaseError } from "../../../error";
import { ProvisionFirebaseAppOptions } from "../../../management/provisioning/types";

describe("ailogic utils", () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("getConfigFileName", () => {
    it("should return correct filename for iOS", () => {
      expect(utils.getConfigFileName("ios")).to.equal("GoogleService-Info.plist");
    });

    it("should return correct filename for Android", () => {
      expect(utils.getConfigFileName("android")).to.equal("google-services.json");
    });

    it("should return correct filename for Web", () => {
      expect(utils.getConfigFileName("web")).to.equal("firebase-config.json");
    });

    it("should throw error for unsupported platform", () => {
      expect(() => utils.getConfigFileName("unsupported" as utils.SupportedPlatform)).to.throw(
        "Unsupported platform: unsupported",
      );
    });
  });

  describe("parseAppId", () => {
    it("should parse valid app IDs and return AppInfo object", () => {
      const validAppIds = [
        {
          appId: "1:123456789:ios:123456789abcdef",
          expected: {
            projectNumber: "123456789",
            appId: "1:123456789:ios:123456789abcdef",
            platform: "ios",
          },
        },
        {
          appId: "2:123456789:android:123456789abcdef",
          expected: {
            projectNumber: "123456789",
            appId: "2:123456789:android:123456789abcdef",
            platform: "android",
          },
        },
        {
          appId: "2:123456789:web:123456789abcdef",
          expected: {
            projectNumber: "123456789",
            appId: "2:123456789:web:123456789abcdef",
            platform: "web",
          },
        },
        {
          appId: "1:999999999:web:abcdef123456789",
          expected: {
            projectNumber: "999999999",
            appId: "1:999999999:web:abcdef123456789",
            platform: "web",
          },
        },
      ];

      validAppIds.forEach(({ appId, expected }) => {
        const result = utils.parseAppId(appId);
        expect(result).to.deep.equal(expected);
      });
    });

    it("should throw error for invalid app ID formats", () => {
      const invalidAppIds = [
        "",
        ":",
        "1:",
        "2:123456789",
        "2:123456789:",
        "2:123456789:test:",
        "2:123456789:ios",
        "2:123456789:web:",
        "2:123456789:android:com_",
        "invalid-id",
        "1:abc:web:123456789abcdef", // non-numeric project number
        "1:123456789:flutter:123456789abcdef", // unsupported platform
      ];

      invalidAppIds.forEach((appId) => {
        expect(() => utils.parseAppId(appId)).to.throw(FirebaseError, /Invalid app ID format/);
      });
    });
  });

  describe("buildProvisionOptions", () => {
    it("should build options for Android app", () => {
      const result = utils.buildProvisionOptions("test-project", "android", "com.example.app");

      expect(result).to.deep.equal({
        project: {
          displayName: "Firebase Project",
          parent: { type: "existing_project", projectId: "test-project" },
        },
        app: {
          platform: AppPlatform.ANDROID,
          packageName: "com.example.app",
        },
        features: {
          firebaseAiLogicInput: {},
        },
      });
    });

    it("should build options for iOS app", () => {
      const result = utils.buildProvisionOptions("test-project", "ios", "com.example.App");

      expect(result).to.deep.equal({
        project: {
          displayName: "Firebase Project",
          parent: { type: "existing_project", projectId: "test-project" },
        },
        app: {
          platform: AppPlatform.IOS,
          bundleId: "com.example.App",
        },
        features: {
          firebaseAiLogicInput: {},
        },
      });
    });

    it("should build options for Web app", () => {
      const result = utils.buildProvisionOptions("test-project", "web", "my-web-app");

      expect(result).to.deep.equal({
        project: {
          displayName: "Firebase Project",
          parent: { type: "existing_project", projectId: "test-project" },
        },
        app: {
          platform: AppPlatform.WEB,
          webAppId: "my-web-app",
        },
        features: {
          firebaseAiLogicInput: {},
        },
      });
    });

    it("should build options without existing project", () => {
      const result = utils.buildProvisionOptions(undefined, "web", "my-web-app");

      expect(result.project).to.deep.equal({
        displayName: "Firebase Project",
      });
      expect(result.project).to.not.have.property("parent");
    });
  });

  describe("provisionAiLogicApp", () => {
    let provisionFirebaseAppStub: sinon.SinonStub;

    beforeEach(() => {
      provisionFirebaseAppStub = sandbox.stub(provision, "provisionFirebaseApp");
    });

    it("should call provisioning API and return response", async () => {
      const mockOptions = { project: {}, app: {}, features: {} };
      const mockResponse = {
        appResource: "projects/test-project/apps/test-app",
        configData: "base64config",
        configMimeType: "application/json",
      };
      provisionFirebaseAppStub.returns(mockResponse);

      const result = await utils.provisionAiLogicApp(mockOptions as ProvisionFirebaseAppOptions);

      sinon.assert.calledWith(provisionFirebaseAppStub, mockOptions);
      expect(result).to.equal(mockResponse);
    });

    it("should wrap provisioning errors in FirebaseError", async () => {
      const mockOptions = { project: {}, app: {}, features: {} };
      const originalError = new Error("API failed");
      provisionFirebaseAppStub.throws(originalError);

      await expect(
        utils.provisionAiLogicApp(mockOptions as ProvisionFirebaseAppOptions),
      ).to.be.rejectedWith(FirebaseError, "AI Logic provisioning failed: API failed");
    });

    it("should handle string errors", async () => {
      const mockOptions = { project: {}, app: {}, features: {} };
      provisionFirebaseAppStub.throws(new Error("String error"));

      await expect(
        utils.provisionAiLogicApp(mockOptions as ProvisionFirebaseAppOptions),
      ).to.be.rejectedWith(FirebaseError, "AI Logic provisioning failed: String error");
    });
  });

  describe("validateProjectNumberMatch", () => {
    it("should not throw when project numbers match", () => {
      const appInfo: utils.AppInfo = {
        projectNumber: "123456789",
        appId: "1:123456789:web:abcdef",
        platform: "web",
      };
      const projectInfo = {
        projectNumber: "123456789",
        projectId: "test-project",
        name: "projects/test-project",
        displayName: "Test Project",
      };

      expect(() => utils.validateProjectNumberMatch(appInfo, projectInfo)).to.not.throw();
    });

    it("should throw when project numbers don't match", () => {
      const appInfo: utils.AppInfo = {
        projectNumber: "123456789",
        appId: "1:123456789:web:abcdef",
        platform: "web",
      };
      const projectInfo = {
        projectNumber: "987654321",
        projectId: "test-project",
        name: "projects/test-project",
        displayName: "Test Project",
      };

      expect(() => utils.validateProjectNumberMatch(appInfo, projectInfo)).to.throw(
        FirebaseError,
        "App 1:123456789:web:abcdef belongs to project number 123456789 but current project has number 987654321.",
      );
    });
  });

  describe("validateAppExists", () => {
    let getAppConfigStub: sinon.SinonStub;

    beforeEach(() => {
      getAppConfigStub = sandbox.stub(apps, "getAppConfig");
    });

    it("should not throw when app exists for web platform", async () => {
      const appInfo: utils.AppInfo = {
        projectNumber: "123456789",
        appId: "1:123456789:web:abcdef",
        platform: "web",
      };
      getAppConfigStub.resolves({ mockConfig: true });

      await expect(utils.validateAppExists(appInfo)).to.not.be.rejected;
      sinon.assert.calledWith(getAppConfigStub, "1:123456789:web:abcdef", AppPlatform.WEB);
    });

    it("should not throw when app exists for ios platform", async () => {
      const appInfo: utils.AppInfo = {
        projectNumber: "123456789",
        appId: "1:123456789:ios:abcdef",
        platform: "ios",
      };
      getAppConfigStub.resolves({ mockConfig: true });

      await expect(utils.validateAppExists(appInfo)).to.not.be.rejected;
      sinon.assert.calledWith(getAppConfigStub, "1:123456789:ios:abcdef", AppPlatform.IOS);
    });

    it("should not throw when app exists for android platform", async () => {
      const appInfo: utils.AppInfo = {
        projectNumber: "123456789",
        appId: "1:123456789:android:abcdef",
        platform: "android",
      };
      getAppConfigStub.resolves({ mockConfig: true });

      await expect(utils.validateAppExists(appInfo)).to.not.be.rejected;
      sinon.assert.calledWith(getAppConfigStub, "1:123456789:android:abcdef", AppPlatform.ANDROID);
    });

    it("should throw when app does not exist", async () => {
      const appInfo: utils.AppInfo = {
        projectNumber: "123456789",
        appId: "1:123456789:web:nonexistent",
        platform: "web",
      };
      getAppConfigStub.throws(new Error("App not found"));

      await expect(utils.validateAppExists(appInfo)).to.be.rejectedWith(
        FirebaseError,
        "App 1:123456789:web:nonexistent does not exist or is not accessible.",
      );
    });
  });
});
