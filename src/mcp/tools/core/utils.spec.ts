import { expect } from "chai";
import * as sinon from "sinon";
import * as fs from "fs-extra";
import * as path from "path";
import {
  getFirebaseConfigFileName,
  getFirebaseConfigFilePath,
  extractBundleIdFromPlist,
  hasPackageNameInAndroidConfig,
  generateUniqueAppDirectoryName,
  findExistingIosApp,
  findExistingAndroidApp,
  writeAppConfigFile,
  extractProjectIdFromAppResource,
  SupportedPlatform,
} from "./utils";

describe("utils", () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("getFirebaseConfigFileName", () => {
    it("should return correct filename for iOS platform", () => {
      const result = getFirebaseConfigFileName("ios");
      expect(result).to.equal("GoogleService-Info.plist");
    });

    it("should return correct filename for Android platform", () => {
      const result = getFirebaseConfigFileName("android");
      expect(result).to.equal("google-services.json");
    });

    it("should return correct filename for Web platform", () => {
      const result = getFirebaseConfigFileName("web");
      expect(result).to.equal("firebase-config.json");
    });

    it("should throw error for unsupported platform", () => {
      expect(() => getFirebaseConfigFileName("unsupported" as SupportedPlatform)).to.throw(
        "Unsupported platform: unsupported",
      );
    });
  });

  describe("getFirebaseConfigFilePath", () => {
    it("should combine directory and filename correctly for iOS", () => {
      const result = getFirebaseConfigFilePath("/path/to/app", "ios");
      expect(result).to.equal(path.join("/path/to/app", "GoogleService-Info.plist"));
    });

    it("should combine directory and filename correctly for Android", () => {
      const result = getFirebaseConfigFilePath("/path/to/app", "android");
      expect(result).to.equal(path.join("/path/to/app", "google-services.json"));
    });

    it("should combine directory and filename correctly for Web", () => {
      const result = getFirebaseConfigFilePath("/path/to/app", "web");
      expect(result).to.equal(path.join("/path/to/app", "firebase-config.json"));
    });
  });

  describe("extractBundleIdFromPlist", () => {
    beforeEach(() => {
      sandbox.stub(fs, "readFileSync");
    });

    it("should extract bundle ID from valid plist", () => {
      const plistContent = `
        <key>BUNDLE_ID</key>
        <string>com.example.app</string>
      `;
      (fs.readFileSync as sinon.SinonStub).returns(plistContent);

      const result = extractBundleIdFromPlist("/path/to/plist");
      expect(result).to.equal("com.example.app");
    });

    it("should throw error when BUNDLE_ID not found", () => {
      const plistContent = `
        <key>OTHER_KEY</key>
        <string>some value</string>
      `;
      (fs.readFileSync as sinon.SinonStub).returns(plistContent);

      expect(() => extractBundleIdFromPlist("/path/to/plist")).to.throw(
        "Failed to parse iOS plist file: /path/to/plist",
      );
    });

    it("should throw error when file cannot be read", () => {
      (fs.readFileSync as sinon.SinonStub).throws(new Error("File not found"));

      expect(() => extractBundleIdFromPlist("/path/to/plist")).to.throw(
        "Failed to parse iOS plist file: /path/to/plist",
      );
    });

    it("should handle empty BUNDLE_ID value", () => {
      const plistContent = `
        <key>BUNDLE_ID</key>
        <string></string>
      `;
      (fs.readFileSync as sinon.SinonStub).returns(plistContent);

      expect(() => extractBundleIdFromPlist("/path/to/plist")).to.throw(
        "Failed to parse iOS plist file: /path/to/plist",
      );
    });
  });

  describe("hasPackageNameInAndroidConfig", () => {
    beforeEach(() => {
      sandbox.stub(fs, "readFileSync");
    });

    it("should return true when package name matches", () => {
      const androidConfig = {
        client: [
          {
            client_info: {
              android_client_info: {
                package_name: "com.example.app",
              },
            },
          },
        ],
      };
      (fs.readFileSync as sinon.SinonStub).returns(JSON.stringify(androidConfig));

      const result = hasPackageNameInAndroidConfig("/path/to/config", "com.example.app");
      expect(result).to.be.true;
    });

    it("should return false when package name does not match", () => {
      const androidConfig = {
        client: [
          {
            client_info: {
              android_client_info: {
                package_name: "com.different.app",
              },
            },
          },
        ],
      };
      (fs.readFileSync as sinon.SinonStub).returns(JSON.stringify(androidConfig));

      const result = hasPackageNameInAndroidConfig("/path/to/config", "com.example.app");
      expect(result).to.be.false;
    });

    it("should return false when client array is missing", () => {
      const androidConfig = {};
      (fs.readFileSync as sinon.SinonStub).returns(JSON.stringify(androidConfig));

      const result = hasPackageNameInAndroidConfig("/path/to/config", "com.example.app");
      expect(result).to.be.false;
    });

    it("should return false when file cannot be read", () => {
      (fs.readFileSync as sinon.SinonStub).throws(new Error("File not found"));

      const result = hasPackageNameInAndroidConfig("/path/to/config", "com.example.app");
      expect(result).to.be.false;
    });

    it("should return false when JSON is invalid", () => {
      (fs.readFileSync as sinon.SinonStub).returns("invalid json");

      const result = hasPackageNameInAndroidConfig("/path/to/config", "com.example.app");
      expect(result).to.be.false;
    });

    it("should handle multiple clients and find matching package name", () => {
      const androidConfig = {
        client: [
          {
            client_info: {
              android_client_info: {
                package_name: "com.other.app",
              },
            },
          },
          {
            client_info: {
              android_client_info: {
                package_name: "com.example.app",
              },
            },
          },
        ],
      };
      (fs.readFileSync as sinon.SinonStub).returns(JSON.stringify(androidConfig));

      const result = hasPackageNameInAndroidConfig("/path/to/config", "com.example.app");
      expect(result).to.be.true;
    });
  });

  describe("generateUniqueAppDirectoryName", () => {
    beforeEach(() => {
      sandbox.stub(fs, "existsSync");
    });

    it("should return platform name when no conflict exists", () => {
      (fs.existsSync as sinon.SinonStub).returns(false);

      const result = generateUniqueAppDirectoryName("/project", "ios");
      expect(result).to.equal("ios");
    });

    it("should increment counter when conflict exists", () => {
      (fs.existsSync as sinon.SinonStub)
        .withArgs(path.join("/project", "ios"))
        .returns(true)
        .withArgs(path.join("/project", "ios-2"))
        .returns(false);

      const result = generateUniqueAppDirectoryName("/project", "ios");
      expect(result).to.equal("ios-2");
    });

    it("should handle multiple conflicts", () => {
      (fs.existsSync as sinon.SinonStub)
        .withArgs(path.join("/project", "android"))
        .returns(true)
        .withArgs(path.join("/project", "android-2"))
        .returns(true)
        .withArgs(path.join("/project", "android-3"))
        .returns(true)
        .withArgs(path.join("/project", "android-4"))
        .returns(false);

      const result = generateUniqueAppDirectoryName("/project", "android");
      expect(result).to.equal("android-4");
    });

    it("should stop at counter limit", () => {
      (fs.existsSync as sinon.SinonStub).returns(true);

      const result = generateUniqueAppDirectoryName("/project", "web");
      expect(result).to.equal("web-1000");
    });
  });

  describe("findExistingIosApp", () => {
    let globStub: sinon.SinonStub;

    beforeEach(async () => {
      // Use dynamic import to avoid require warnings
      const globModule = await import("glob");

      globStub = sandbox.stub(globModule, "glob");
      sandbox.stub(fs, "readFileSync");
    });

    it("should find existing iOS app with matching bundle ID", async () => {
      const plistFiles = ["/project/ios/GoogleService-Info.plist"];
      const plistContent = `
        <key>BUNDLE_ID</key>
        <string>com.example.app</string>
      `;
      globStub.resolves(plistFiles);
      (fs.readFileSync as sinon.SinonStub).withArgs(plistFiles[0], "utf8").returns(plistContent);

      const result = await findExistingIosApp("/project", "com.example.app");

      expect(result).to.deep.equal({
        platform: "ios",
        configFilePath: plistFiles[0],
        bundleId: "com.example.app",
      });
    });

    it("should return undefined when no matching bundle ID found", async () => {
      const plistFiles = ["/project/ios/GoogleService-Info.plist"];
      const plistContent = `
        <key>BUNDLE_ID</key>
        <string>com.different.app</string>
      `;
      globStub.resolves(plistFiles);
      (fs.readFileSync as sinon.SinonStub).withArgs(plistFiles[0], "utf8").returns(plistContent);

      const result = await findExistingIosApp("/project", "com.example.app");
      expect(result).to.be.undefined;
    });

    it("should return undefined when no plist files found", async () => {
      globStub.resolves([]);

      const result = await findExistingIosApp("/project", "com.example.app");
      expect(result).to.be.undefined;
    });

    it("should continue when plist parsing fails", async () => {
      const plistFiles = [
        "/project/ios1/GoogleService-Info.plist",
        "/project/ios2/GoogleService-Info.plist",
      ];
      const validPlistContent = `
        <key>BUNDLE_ID</key>
        <string>com.example.app</string>
      `;
      globStub.resolves(plistFiles);
      (fs.readFileSync as sinon.SinonStub)
        .withArgs(plistFiles[0], "utf8")
        .throws(new Error("Parse error"))
        .withArgs(plistFiles[1], "utf8")
        .returns(validPlistContent);

      const result = await findExistingIosApp("/project", "com.example.app");

      expect(result).to.deep.equal({
        platform: "ios",
        configFilePath: plistFiles[1],
        bundleId: "com.example.app",
      });
    });
  });

  describe("findExistingAndroidApp", () => {
    let globStub: sinon.SinonStub;

    beforeEach(async () => {
      // Use dynamic import to avoid require warnings
      const globModule = await import("glob");

      globStub = sandbox.stub(globModule, "glob");
      sandbox.stub(fs, "readFileSync");
    });

    it("should find existing Android app with matching package name", async () => {
      const jsonFiles = ["/project/android/google-services.json"];
      const androidConfig = {
        client: [
          {
            client_info: {
              android_client_info: {
                package_name: "com.example.app",
              },
            },
          },
        ],
      };
      globStub.resolves(jsonFiles);
      (fs.readFileSync as sinon.SinonStub)
        .withArgs(jsonFiles[0], "utf8")
        .returns(JSON.stringify(androidConfig));

      const result = await findExistingAndroidApp("/project", "com.example.app");

      expect(result).to.deep.equal({
        platform: "android",
        configFilePath: jsonFiles[0],
        packageName: "com.example.app",
      });
    });

    it("should return undefined when no matching package name found", async () => {
      const jsonFiles = ["/project/android/google-services.json"];
      const androidConfig = {
        client: [
          {
            client_info: {
              android_client_info: {
                package_name: "com.different.app",
              },
            },
          },
        ],
      };
      globStub.resolves(jsonFiles);
      (fs.readFileSync as sinon.SinonStub)
        .withArgs(jsonFiles[0], "utf8")
        .returns(JSON.stringify(androidConfig));

      const result = await findExistingAndroidApp("/project", "com.example.app");
      expect(result).to.be.undefined;
    });

    it("should return undefined when no JSON files found", async () => {
      globStub.resolves([]);

      const result = await findExistingAndroidApp("/project", "com.example.app");
      expect(result).to.be.undefined;
    });

    it("should continue when JSON parsing fails", async () => {
      const jsonFiles = [
        "/project/android1/google-services.json",
        "/project/android2/google-services.json",
      ];
      const validAndroidConfig = {
        client: [
          {
            client_info: {
              android_client_info: {
                package_name: "com.example.app",
              },
            },
          },
        ],
      };
      globStub.resolves(jsonFiles);
      (fs.readFileSync as sinon.SinonStub)
        .withArgs(jsonFiles[0], "utf8")
        .throws(new Error("Parse error"))
        .withArgs(jsonFiles[1], "utf8")
        .returns(JSON.stringify(validAndroidConfig));

      const result = await findExistingAndroidApp("/project", "com.example.app");

      expect(result).to.deep.equal({
        platform: "android",
        configFilePath: jsonFiles[1],
        packageName: "com.example.app",
      });
    });
  });

  describe("writeAppConfigFile", () => {
    beforeEach(() => {
      sandbox.stub(fs, "ensureDirSync");
      sandbox.stub(fs, "writeFileSync");
    });

    it("should write decoded base64 content to file", () => {
      const base64Data = Buffer.from("test config content").toString("base64");
      const filePath = "/path/to/config.json";

      writeAppConfigFile(filePath, base64Data);

      expect(fs.ensureDirSync).to.have.been.calledWith(path.dirname(filePath));
      expect(fs.writeFileSync).to.have.been.calledWith(filePath, "test config content", "utf8");
    });

    it("should handle invalid base64 gracefully", () => {
      const invalidBase64 = "invalid-base64!@#";
      const filePath = "/path/to/config.json";

      // Invalid base64 might still decode to something, so we just ensure it doesn't crash
      expect(() => writeAppConfigFile(filePath, invalidBase64)).to.not.throw();
    });

    it("should throw error when file write fails", () => {
      const base64Data = Buffer.from("test content").toString("base64");
      const filePath = "/path/to/config.json";
      (fs.writeFileSync as sinon.SinonStub).throws(new Error("Permission denied"));

      expect(() => writeAppConfigFile(filePath, base64Data)).to.throw(
        `Failed to write config file to ${filePath}: Permission denied`,
      );
    });
  });

  describe("extractProjectIdFromAppResource", () => {
    it("should extract project ID from valid app resource", () => {
      const appResource = "projects/my-project-id/apps/1234567890";
      const result = extractProjectIdFromAppResource(appResource);
      expect(result).to.equal("my-project-id");
    });

    it("should extract project ID with hyphens and numbers", () => {
      const appResource = "projects/my-project-123/apps/web-app-id";
      const result = extractProjectIdFromAppResource(appResource);
      expect(result).to.equal("my-project-123");
    });

    it("should throw error for invalid format", () => {
      const appResource = "invalid-format";
      expect(() => extractProjectIdFromAppResource(appResource)).to.throw(
        `Invalid app resource format: ${appResource}`,
      );
    });

    it("should throw error for missing project prefix", () => {
      const appResource = "apps/1234567890";
      expect(() => extractProjectIdFromAppResource(appResource)).to.throw(
        `Invalid app resource format: ${appResource}`,
      );
    });
  });
});
