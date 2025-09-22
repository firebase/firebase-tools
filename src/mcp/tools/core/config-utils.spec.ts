import { expect } from "chai";
import * as sinon from "sinon";
import * as fs from "fs-extra";
import * as path from "path";
import {
  writeConfigFile,
  extractProjectIdFromAppResource,
  updateFirebaseRC,
  validateConfigFilePath,
} from "./config-utils";

describe("Config Utils", () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("writeConfigFile", () => {
    let ensureDirStub: sinon.SinonStub;
    let writeFileStub: sinon.SinonStub;

    beforeEach(() => {
      ensureDirStub = sandbox.stub(fs, "ensureDir").resolves();
      writeFileStub = sandbox.stub(fs, "writeFile").resolves();
    });

    it("should decode base64 and write config correctly", async () => {
      const filePath = "/test/dir/config.json";
      const testData = { test: "data" };
      const base64Data = Buffer.from(JSON.stringify(testData), 'utf8').toString('base64');

      await writeConfigFile(filePath, base64Data, "application/json");

      expect(ensureDirStub.calledOnce).to.be.true;
      expect(ensureDirStub.calledWith("/test/dir")).to.be.true;
      expect(writeFileStub.calledOnce).to.be.true;
      expect(writeFileStub.calledWith(filePath, JSON.stringify(testData), 'utf8')).to.be.true;
    });

    it("should create directories if they don't exist", async () => {
      const filePath = "/deep/nested/path/config.json";
      const base64Data = Buffer.from("test content", 'utf8').toString('base64');

      await writeConfigFile(filePath, base64Data, "text/plain");

      expect(ensureDirStub.calledWith("/deep/nested/path")).to.be.true;
    });

    it("should handle write errors gracefully", async () => {
      const filePath = "/test/config.json";
      const base64Data = Buffer.from("test", 'utf8').toString('base64');
      const error = new Error("Permission denied");

      writeFileStub.rejects(error);

      try {
        await writeConfigFile(filePath, base64Data, "text/plain");
        expect.fail("Should have thrown an error");
      } catch (err: any) {
        expect(err.message).to.include("Failed to write config file to /test/config.json");
        expect(err.message).to.include("Permission denied");
      }
    });

    it("should handle directory creation errors gracefully", async () => {
      const filePath = "/test/config.json";
      const base64Data = Buffer.from("test", 'utf8').toString('base64');
      const error = new Error("Cannot create directory");

      ensureDirStub.rejects(error);

      try {
        await writeConfigFile(filePath, base64Data, "text/plain");
        expect.fail("Should have thrown an error");
      } catch (err: any) {
        expect(err.message).to.include("Failed to write config file to /test/config.json");
        expect(err.message).to.include("Cannot create directory");
      }
    });

    it("should handle invalid base64 data gracefully", async () => {
      const filePath = "/test/config.json";
      const invalidBase64 = "invalid-base64-data!@#";

      // Invalid base64 should still be processed by Buffer.from
      // So this test should actually succeed - let's remove this test
      // since Node.js Buffer.from is quite permissive with base64
      await writeConfigFile(filePath, invalidBase64, "application/json");

      expect(writeFileStub.calledOnce).to.be.true;
    });
  });

  describe("extractProjectIdFromAppResource", () => {
    it("should extract project ID from valid app resource", () => {
      const appResource = "projects/my-firebase-project/apps/1234567890";
      const result = extractProjectIdFromAppResource(appResource);
      expect(result).to.equal("my-firebase-project");
    });

    it("should extract project ID from app resource with hyphens and numbers", () => {
      const appResource = "projects/test-project-123/apps/web:abc123def456";
      const result = extractProjectIdFromAppResource(appResource);
      expect(result).to.equal("test-project-123");
    });

    it("should throw error for invalid format - missing projects prefix", () => {
      const appResource = "invalid/my-project/apps/123";
      expect(() => extractProjectIdFromAppResource(appResource)).to.throw(
        "Invalid app resource format: invalid/my-project/apps/123"
      );
    });

    it("should throw error for invalid format - missing parts", () => {
      const appResource = "projects/";
      expect(() => extractProjectIdFromAppResource(appResource)).to.throw(
        "Invalid app resource format: projects/"
      );
    });

    it("should throw error for empty string", () => {
      const appResource = "";
      expect(() => extractProjectIdFromAppResource(appResource)).to.throw(
        "Invalid app resource format: "
      );
    });

    it("should throw error for malformed resource", () => {
      const appResource = "not-a-valid-resource-format";
      expect(() => extractProjectIdFromAppResource(appResource)).to.throw(
        "Invalid app resource format: not-a-valid-resource-format"
      );
    });
  });

  describe("updateFirebaseRC", () => {
    it("should update project ID in empty .firebaserc", () => {
      const rc = { data: {} as any };
      const projectId = "my-new-project";

      updateFirebaseRC(rc, projectId, false);

      expect(rc.data.projects).to.deep.equal({ default: projectId });
    });

    it("should update project ID when no existing projects", () => {
      const rc = { data: { targets: {} } as any };
      const projectId = "my-project";

      updateFirebaseRC(rc, projectId, false);

      expect(rc.data.projects).to.deep.equal({ default: projectId });
      expect(rc.data.targets).to.deep.equal({}); // Should preserve existing data
    });

    it("should handle overwrite when explicitly allowed", () => {
      const rc = { data: { projects: { default: "old-project" } } };
      const projectId = "new-project";

      updateFirebaseRC(rc, projectId, true);

      expect(rc.data.projects.default).to.equal(projectId);
    });

    it("should throw error when project exists and overwrite not allowed", () => {
      const rc = { data: { projects: { default: "existing-project" } } };
      const projectId = "new-project";

      expect(() => updateFirebaseRC(rc, projectId, false)).to.throw(
        "Project already configured in .firebaserc as 'existing-project'. Use overwrite_project: true to replace."
      );
    });

    it("should allow updating to same project ID", () => {
      const rc = { data: { projects: { default: "same-project" } } };
      const projectId = "same-project";

      updateFirebaseRC(rc, projectId, false);

      expect(rc.data.projects.default).to.equal(projectId);
    });

    it("should throw error for invalid rc object - missing data", () => {
      const rc = {};
      const projectId = "test-project";

      expect(() => updateFirebaseRC(rc, projectId, false)).to.throw(
        "Invalid .firebaserc configuration"
      );
    });

    it("should throw error for null rc object", () => {
      const rc = null;
      const projectId = "test-project";

      expect(() => updateFirebaseRC(rc, projectId, false)).to.throw(
        "Invalid .firebaserc configuration"
      );
    });

    it("should preserve other project configurations", () => {
      const rc = {
        data: {
          projects: {
            default: "old-project",
            staging: "staging-project"
          }
        }
      };
      const projectId = "new-project";

      updateFirebaseRC(rc, projectId, true);

      expect(rc.data.projects.default).to.equal(projectId);
      expect(rc.data.projects.staging).to.equal("staging-project");
    });
  });

  describe("validateConfigFilePath", () => {
    it("should validate iOS config filename correctly", () => {
      const filePath = "/path/to/GoogleService-Info.plist";
      expect(() => validateConfigFilePath(filePath, "ios")).to.not.throw();
    });

    it("should validate Android config filename correctly", () => {
      const filePath = "/path/to/google-services.json";
      expect(() => validateConfigFilePath(filePath, "android")).to.not.throw();
    });

    it("should validate Web config filename correctly", () => {
      const filePath = "/path/to/firebase-config.json";
      expect(() => validateConfigFilePath(filePath, "web")).to.not.throw();
    });

    it("should throw error for incorrect iOS filename", () => {
      const filePath = "/path/to/wrong-name.plist";
      expect(() => validateConfigFilePath(filePath, "ios")).to.throw(
        "Invalid config filename for ios: expected GoogleService-Info.plist, got wrong-name.plist"
      );
    });

    it("should throw error for incorrect Android filename", () => {
      const filePath = "/path/to/config.json";
      expect(() => validateConfigFilePath(filePath, "android")).to.throw(
        "Invalid config filename for android: expected google-services.json, got config.json"
      );
    });

    it("should throw error for incorrect Web filename", () => {
      const filePath = "/path/to/config.js";
      expect(() => validateConfigFilePath(filePath, "web")).to.throw(
        "Invalid config filename for web: expected firebase-config.json, got config.js"
      );
    });

    it("should throw error for unsupported platform", () => {
      const filePath = "/path/to/config.txt";
      expect(() => validateConfigFilePath(filePath, "unsupported")).to.throw(
        "Unsupported platform: unsupported"
      );
    });

    it("should validate deep nested paths correctly", () => {
      const filePath = "/very/deep/nested/path/GoogleService-Info.plist";
      expect(() => validateConfigFilePath(filePath, "ios")).to.not.throw();
    });

    it("should validate relative paths correctly", () => {
      const filePath = "./google-services.json";
      expect(() => validateConfigFilePath(filePath, "android")).to.not.throw();
    });
  });
});