import { expect } from "chai";
import * as sinon from "sinon";
import * as path from "path";
import * as fs from "fs-extra";
import * as globModule from "glob";
import {
  getFirebaseConfigFileName,
  getFirebaseConfigFilePath,
  handleConfigFileConflict,
  extractBundleIdFromPlist,
  extractPackageNameFromAndroidConfig,
  findExistingIosApp,
  findExistingAndroidApp,
  SupportedPlatform,
} from "./app-context";

describe("app-context", () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  // Helper functions for test data generation
  function createMockPlistContent(bundleId: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key>
  <string>${bundleId}</string>
</dict>
</plist>`;
  }

  function createMockAndroidConfig(packageName: string): string {
    return JSON.stringify({
      project_info: { project_number: "123456789" },
      client: [
        {
          client_info: {
            mobilesdk_app_id: "1:123456789:android:abc123",
            android_client_info: { package_name: packageName },
          },
        },
      ],
    });
  }

  describe("getFirebaseConfigFileName", () => {
    it("should return GoogleService-Info.plist for iOS platform", () => {
      const result = getFirebaseConfigFileName("ios");
      expect(result).to.equal("GoogleService-Info.plist");
    });

    it("should return google-services.json for Android platform", () => {
      const result = getFirebaseConfigFileName("android");
      expect(result).to.equal("google-services.json");
    });

    it("should return firebase-config.json for Web platform", () => {
      const result = getFirebaseConfigFileName("web");
      expect(result).to.equal("firebase-config.json");
    });

    it("should throw error for invalid platform", () => {
      expect(() => {
        getFirebaseConfigFileName("invalid" as SupportedPlatform);
      }).to.throw("Unsupported platform: invalid");
    });
  });

  describe("getFirebaseConfigFilePath", () => {
    it("should generate correct path for iOS app in standard directory", () => {
      const appDirectory = "/project/ios";
      const result = getFirebaseConfigFilePath(appDirectory, "ios");
      expect(result).to.equal(path.join(appDirectory, "GoogleService-Info.plist"));
    });

    it("should generate correct path for Android app in standard directory", () => {
      const appDirectory = "/project/android";
      const result = getFirebaseConfigFilePath(appDirectory, "android");
      expect(result).to.equal(path.join(appDirectory, "google-services.json"));
    });

    it("should generate correct path for Web app in standard directory", () => {
      const appDirectory = "/project/web";
      const result = getFirebaseConfigFilePath(appDirectory, "web");
      expect(result).to.equal(path.join(appDirectory, "firebase-config.json"));
    });

    it("should generate correct path for custom app directory", () => {
      const appDirectory = "/project/my-custom-ios-app";
      const result = getFirebaseConfigFilePath(appDirectory, "ios");
      expect(result).to.equal(path.join(appDirectory, "GoogleService-Info.plist"));
    });

    it("should handle relative app directory paths", () => {
      const appDirectory = "ios";
      const result = getFirebaseConfigFilePath(appDirectory, "ios");
      expect(result).to.equal(path.join("ios", "GoogleService-Info.plist"));
    });

    it("should throw error for invalid platform", () => {
      expect(() => {
        getFirebaseConfigFilePath("/project/app", "invalid" as SupportedPlatform);
      }).to.throw("Unsupported platform: invalid");
    });
  });

  describe("handleConfigFileConflict", () => {
    let existsSyncStub: sinon.SinonStub;

    beforeEach(() => {
      existsSyncStub = sandbox.stub(fs, "existsSync");
    });

    it("should succeed when config file does not exist", () => {
      existsSyncStub.returns(false);

      expect(() => {
        handleConfigFileConflict(
          "/project/ios/GoogleService-Info.plist",
          /* overwriteConfigs */ false,
        );
      }).to.not.throw();
    });

    it("should succeed when config file exists and overwrite is enabled", () => {
      existsSyncStub.returns(true);

      expect(() => {
        handleConfigFileConflict(
          "/project/ios/GoogleService-Info.plist",
          /* overwriteConfigs */ true,
        );
      }).to.not.throw();
    });

    it("should throw error when config file exists and overwrite is disabled", () => {
      existsSyncStub.returns(true);

      expect(() => {
        handleConfigFileConflict(
          "/project/ios/GoogleService-Info.plist",
          /* overwriteConfigs */ false,
        );
      }).to.throw(
        "Config file /project/ios/GoogleService-Info.plist already exists. Use overwrite_configs: true to update.",
      );
    });
  });

  describe("extractBundleIdFromPlist", () => {
    let readFileSyncStub: sinon.SinonStub;

    beforeEach(() => {
      readFileSyncStub = sandbox.stub(fs, "readFileSync");
    });

    it("should extract bundle_id from iOS plist file", () => {
      readFileSyncStub.returns(createMockPlistContent("com.example.testapp"));

      const result = extractBundleIdFromPlist("/path/GoogleService-Info.plist");
      expect(result).to.equal("com.example.testapp");
    });

    it("should throw error when CFBundleIdentifier is not found", () => {
      const mockPlistContent = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
  <key>SomeOtherKey</key>
  <string>somevalue</string>
</dict>
</plist>`;
      readFileSyncStub.returns(mockPlistContent);

      expect(() => {
        extractBundleIdFromPlist("/path/GoogleService-Info.plist");
      }).to.throw("Failed to parse iOS plist file: /path/GoogleService-Info.plist");
    });

    it("should throw error when plist content is invalid", () => {
      readFileSyncStub.returns("invalid plist content");

      expect(() => {
        extractBundleIdFromPlist("/path/GoogleService-Info.plist");
      }).to.throw("Failed to parse iOS plist file: /path/GoogleService-Info.plist");
    });
  });

  describe("extractPackageNameFromAndroidConfig", () => {
    let readFileSyncStub: sinon.SinonStub;

    beforeEach(() => {
      readFileSyncStub = sandbox.stub(fs, "readFileSync");
    });

    it("should extract package_name from Android JSON file", () => {
      readFileSyncStub.returns(createMockAndroidConfig("com.example.androidapp"));

      const result = extractPackageNameFromAndroidConfig("/path/google-services.json");
      expect(result).to.equal("com.example.androidapp");
    });

    it("should throw error when package_name is not found", () => {
      const mockJsonContent = JSON.stringify({
        project_info: { project_number: "123456789" },
        client: [{ client_info: { mobilesdk_app_id: "1:123456789:android:abc123" } }],
      });
      readFileSyncStub.returns(mockJsonContent);

      expect(() => {
        extractPackageNameFromAndroidConfig("/path/google-services.json");
      }).to.throw("Failed to parse Android config file: /path/google-services.json");
    });

    it("should throw error when JSON content is invalid", () => {
      readFileSyncStub.returns("invalid json content");

      expect(() => {
        extractPackageNameFromAndroidConfig("/path/google-services.json");
      }).to.throw("Failed to parse Android config file: /path/google-services.json");
    });
  });

  describe("findExistingIosApp", () => {
    let globStub: sinon.SinonStub;

    beforeEach(() => {
      globStub = sandbox.stub(globModule, "glob");
    });

    it("should return undefined when no iOS config files found", async () => {
      globStub.resolves([]);

      const result = await findExistingIosApp("/project", "com.example.app");
      expect(result).to.be.undefined;
    });

    it("should return undefined when bundle ID does not match", async () => {
      globStub.resolves(["/project/ios/GoogleService-Info.plist"]);
      sandbox.stub(fs, "readFileSync").returns(createMockPlistContent("com.example.different"));

      const result = await findExistingIosApp("/project", "com.example.target");
      expect(result).to.be.undefined;
    });

    it("should return app state when bundle ID matches", async () => {
      globStub.resolves(["/project/ios/GoogleService-Info.plist"]);
      sandbox.stub(fs, "readFileSync").returns(createMockPlistContent("com.example.target"));

      const result = await findExistingIosApp("/project", "com.example.target");
      expect(result).to.deep.equal({
        platform: "ios",
        directory: "/project/ios",
        configFilePath: "/project/ios/GoogleService-Info.plist",
        bundleId: "com.example.target",
        shouldCreateDirectory: false,
      });
    });

    it("should return first matching app when multiple files exist", async () => {
      globStub.resolves([
        "/project/ios/GoogleService-Info.plist",
        "/project/ios-other/GoogleService-Info.plist",
      ]);
      const readFileStub = sandbox.stub(fs, "readFileSync");
      readFileStub.onFirstCall().returns(createMockPlistContent("com.example.target"));
      readFileStub.onSecondCall().returns(createMockPlistContent("com.example.other"));

      const result = await findExistingIosApp("/project", "com.example.target");
      expect(result?.directory).to.equal("/project/ios");
    });

    it("should skip invalid config files and continue searching", async () => {
      globStub.resolves([
        "/project/ios-invalid/GoogleService-Info.plist",
        "/project/ios-valid/GoogleService-Info.plist",
      ]);
      const readFileStub = sandbox.stub(fs, "readFileSync");
      readFileStub.onFirstCall().returns("invalid plist content");
      readFileStub.onSecondCall().returns(createMockPlistContent("com.example.target"));

      const result = await findExistingIosApp("/project", "com.example.target");
      expect(result?.directory).to.equal("/project/ios-valid");
    });
  });

  describe("findExistingAndroidApp", () => {
    let globStub: sinon.SinonStub;

    beforeEach(() => {
      globStub = sandbox.stub(globModule, "glob");
    });

    it("should return undefined when no Android config files found", async () => {
      globStub.resolves([]);

      const result = await findExistingAndroidApp("/project", "com.example.app");
      expect(result).to.be.undefined;
    });

    it("should return undefined when package name does not match", async () => {
      globStub.resolves(["/project/android/google-services.json"]);
      sandbox.stub(fs, "readFileSync").returns(createMockAndroidConfig("com.example.different"));

      const result = await findExistingAndroidApp("/project", "com.example.target");
      expect(result).to.be.undefined;
    });

    it("should return app state when package name matches", async () => {
      globStub.resolves(["/project/android/google-services.json"]);
      sandbox.stub(fs, "readFileSync").returns(createMockAndroidConfig("com.example.target"));

      const result = await findExistingAndroidApp("/project", "com.example.target");
      expect(result).to.deep.equal({
        platform: "android",
        directory: "/project/android",
        configFilePath: "/project/android/google-services.json",
        packageName: "com.example.target",
        shouldCreateDirectory: false,
      });
    });

    it("should return first matching app when multiple files exist", async () => {
      globStub.resolves([
        "/project/android/google-services.json",
        "/project/android-other/google-services.json",
      ]);
      const readFileStub = sandbox.stub(fs, "readFileSync");
      readFileStub.onFirstCall().returns(createMockAndroidConfig("com.example.target"));
      readFileStub.onSecondCall().returns(createMockAndroidConfig("com.example.other"));

      const result = await findExistingAndroidApp("/project", "com.example.target");
      expect(result?.directory).to.equal("/project/android");
    });

    it("should skip invalid config files and continue searching", async () => {
      globStub.resolves([
        "/project/android-invalid/google-services.json",
        "/project/android-valid/google-services.json",
      ]);
      const readFileStub = sandbox.stub(fs, "readFileSync");
      readFileStub.onFirstCall().returns("invalid json content");
      readFileStub.onSecondCall().returns(createMockAndroidConfig("com.example.target"));

      const result = await findExistingAndroidApp("/project", "com.example.target");
      expect(result?.directory).to.equal("/project/android-valid");
    });
  });
});
