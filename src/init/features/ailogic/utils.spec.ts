import { expect } from "chai";
import * as sinon from "sinon";
import * as utils from "./utils";
import * as apps from "../../../management/apps";
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
      expect(utils.getConfigFileName(AppPlatform.IOS)).to.equal("GoogleService-Info.plist");
    });

    it("should return correct filename for Android", () => {
      expect(utils.getConfigFileName(AppPlatform.ANDROID)).to.equal("google-services.json");
    });

    it("should return correct filename for Web", () => {
      expect(utils.getConfigFileName(AppPlatform.WEB)).to.equal("firebase-config.json");
    });

    it("should throw error for unsupported platform", () => {
      expect(() => utils.getConfigFileName("unsupported" as AppPlatform)).to.throw(
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
            platform: AppPlatform.IOS,
          },
        },
        {
          appId: "2:123456789:android:123456789abcdef",
          expected: {
            projectNumber: "123456789",
            appId: "2:123456789:android:123456789abcdef",
            platform: AppPlatform.ANDROID,
          },
        },
        {
          appId: "2:123456789:web:123456789abcdef",
          expected: {
            projectNumber: "123456789",
            appId: "2:123456789:web:123456789abcdef",
            platform: AppPlatform.WEB,
          },
        },
        {
          appId: "1:999999999:web:abcdef123456789",
          expected: {
            projectNumber: "999999999",
            appId: "1:999999999:web:abcdef123456789",
            platform: AppPlatform.WEB,
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

  describe("validateProjectNumberMatch", () => {
    it("should not throw when project numbers match", () => {
      const appInfo: utils.AppInfo = {
        projectNumber: "123456789",
        appId: "1:123456789:web:abcdef",
        platform: AppPlatform.WEB,
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
        platform: AppPlatform.WEB,
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
        platform: AppPlatform.WEB,
      };
      getAppConfigStub.resolves({ mockConfig: true });

      await expect(utils.validateAppExists(appInfo)).to.not.be.rejected;
      sinon.assert.calledWith(getAppConfigStub, "1:123456789:web:abcdef", AppPlatform.WEB);
    });

    it("should not throw when app exists for ios platform", async () => {
      const appInfo: utils.AppInfo = {
        projectNumber: "123456789",
        appId: "1:123456789:ios:abcdef",
        platform: AppPlatform.IOS,
      };
      getAppConfigStub.resolves({ mockConfig: true });

      await expect(utils.validateAppExists(appInfo)).to.not.be.rejected;
      sinon.assert.calledWith(getAppConfigStub, "1:123456789:ios:abcdef", AppPlatform.IOS);
    });

    it("should not throw when app exists for android platform", async () => {
      const appInfo: utils.AppInfo = {
        projectNumber: "123456789",
        appId: "1:123456789:android:abcdef",
        platform: AppPlatform.ANDROID,
      };
      getAppConfigStub.resolves({ mockConfig: true });

      await expect(utils.validateAppExists(appInfo)).to.not.be.rejected;
      sinon.assert.calledWith(getAppConfigStub, "1:123456789:android:abcdef", AppPlatform.ANDROID);
    });

    it("should throw when app does not exist", async () => {
      const appInfo: utils.AppInfo = {
        projectNumber: "123456789",
        appId: "1:123456789:web:nonexistent",
        platform: AppPlatform.WEB,
      };
      getAppConfigStub.throws(new Error("App not found"));

      await expect(utils.validateAppExists(appInfo)).to.be.rejectedWith(
        FirebaseError,
        "App 1:123456789:web:nonexistent does not exist or is not accessible.",
      );
    });
  });
});
