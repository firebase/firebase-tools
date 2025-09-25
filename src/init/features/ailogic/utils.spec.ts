import { expect } from "chai";
import * as sinon from "sinon";
import * as fs from "fs-extra";
import * as path from "path";
import * as utils from "./utils";
import * as appFinder from "../../../dataconnect/appFinder";
import * as provision from "../../../management/provisioning/provision";
import { Platform } from "../../../dataconnect/types";
import { AppPlatform } from "../../../management/apps";
import { FirebaseError } from "../../../error";

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
      expect(() => utils.getConfigFileName("unsupported" as any)).to.throw(
        "Unsupported platform: unsupported"
      );
    });
  });

  describe("getConfigFilePath", () => {
    it("should return correct path for iOS", () => {
      const result = utils.getConfigFilePath("/test/project", "ios");
      expect(result).to.equal(path.join("/test/project", "GoogleService-Info.plist"));
    });

    it("should return correct path for Android", () => {
      const result = utils.getConfigFilePath("/test/project", "android");
      expect(result).to.equal(path.join("/test/project", "google-services.json"));
    });

    it("should return correct path for Web", () => {
      const result = utils.getConfigFilePath("/test/project", "web");
      expect(result).to.equal(path.join("/test/project", "firebase-config.json"));
    });
  });

  describe("writeAppConfigFile", () => {
    let ensureDirSyncStub: sinon.SinonStub;
    let writeFileSyncStub: sinon.SinonStub;

    beforeEach(() => {
      ensureDirSyncStub = sandbox.stub(fs, "ensureDirSync");
      writeFileSyncStub = sandbox.stub(fs, "writeFileSync");
    });

    it("should decode base64 and write config file", () => {
      const filePath = "/test/project/google-services.json";
      const base64Data = Buffer.from("test config content").toString("base64");

      utils.writeAppConfigFile(filePath, base64Data);

      sinon.assert.calledWith(ensureDirSyncStub, "/test/project");
      sinon.assert.calledWith(writeFileSyncStub, filePath, "test config content", "utf8");
    });

    it("should throw error if file write fails", () => {
      const filePath = "/test/project/config.json";
      const base64Data = "validbase64";
      writeFileSyncStub.throws(new Error("Write failed"));

      expect(() => utils.writeAppConfigFile(filePath, base64Data)).to.throw(
        "Failed to write config file to /test/project/config.json: Write failed"
      );
    });
  });

  describe("extractProjectIdFromAppResource", () => {
    it("should extract project ID from valid app resource", () => {
      const appResource = "projects/my-test-project/apps/my-app";
      const result = utils.extractProjectIdFromAppResource(appResource);
      expect(result).to.equal("my-test-project");
    });

    it("should throw error for invalid app resource format", () => {
      const invalidResource = "invalid-resource-format";
      expect(() => utils.extractProjectIdFromAppResource(invalidResource)).to.throw(
        "Invalid app resource format: invalid-resource-format"
      );
    });
  });

  describe("detectAppPlatform", () => {
    let getPlatformFromFolderStub: sinon.SinonStub;

    beforeEach(() => {
      getPlatformFromFolderStub = sandbox.stub(appFinder, "getPlatformFromFolder");
    });

    it("should return 'web' for Platform.WEB", async () => {
      getPlatformFromFolderStub.returns(Platform.WEB);

      const result = await utils.detectAppPlatform("/test/project");
      expect(result).to.equal("web");
    });

    it("should return 'android' for Platform.ANDROID", async () => {
      getPlatformFromFolderStub.returns(Platform.ANDROID);

      const result = await utils.detectAppPlatform("/test/project");
      expect(result).to.equal("android");
    });

    it("should return 'ios' for Platform.IOS", async () => {
      getPlatformFromFolderStub.returns(Platform.IOS);

      const result = await utils.detectAppPlatform("/test/project");
      expect(result).to.equal("ios");
    });

    it("should throw helpful error for Platform.NONE", async () => {
      getPlatformFromFolderStub.returns(Platform.NONE);

      await expect(utils.detectAppPlatform("/test/project")).to.be.rejectedWith(
        "No app platform detected in current directory. Please specify app_platform (android, ios, or web) " +
          "or create an app first (e.g., 'npx create-react-app my-app', 'flutter create my-app')."
      );
    });

    it("should throw helpful error for Platform.MULTIPLE", async () => {
      getPlatformFromFolderStub.returns(Platform.MULTIPLE);

      await expect(utils.detectAppPlatform("/test/project")).to.be.rejectedWith(
        "Multiple app platforms detected in current directory. Please specify app_platform (android, ios, or web) " +
          "to clarify which platform to use for Firebase app creation."
      );
    });

    it("should throw error for unsupported platform", async () => {
      getPlatformFromFolderStub.returns(Platform.FLUTTER);

      await expect(utils.detectAppPlatform("/test/project")).to.be.rejectedWith(
        "Unsupported platform detected: FLUTTER. Please specify app_platform (android, ios, or web)."
      );
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

      const result = await utils.provisionAiLogicApp(mockOptions as any);

      sinon.assert.calledWith(provisionFirebaseAppStub, mockOptions);
      expect(result).to.equal(mockResponse);
    });

    it("should wrap provisioning errors in FirebaseError", async () => {
      const mockOptions = { project: {}, app: {}, features: {} };
      const originalError = new Error("API failed");
      provisionFirebaseAppStub.throws(originalError);

      await expect(utils.provisionAiLogicApp(mockOptions as any)).to.be.rejectedWith(
        FirebaseError,
        "AI Logic provisioning failed: API failed"
      );
    });

    it("should handle string errors", async () => {
      const mockOptions = { project: {}, app: {}, features: {} };
      provisionFirebaseAppStub.throws(new Error("String error"));

      await expect(utils.provisionAiLogicApp(mockOptions as any)).to.be.rejectedWith(
        FirebaseError,
        "AI Logic provisioning failed: String error"
      );
    });
  });
});