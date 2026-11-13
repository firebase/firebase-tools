import * as chai from "chai";

import { FirebaseError } from "../error";
import { AppPlatform } from "../management/apps";
import { parseAppPlatform, parsePlatform, parseProjectNumber, PLATFORM_PATH } from "./utils";

const expect = chai.expect;

describe("crashlytics utils", () => {
  describe("parseProjectNumber", () => {
    it("should extract the project number from a valid App ID", () => {
      expect(parseProjectNumber("1:1234567890:android:abcdef1234567890")).to.equal("1234567890");
    });

    it("should throw FirebaseError when App ID has no colon separator", () => {
      expect(() => parseProjectNumber("invalid-app-id")).to.throw(
        FirebaseError,
        "Unable to get the projectId from the AppId.",
      );
    });
  });

  describe("parseAppPlatform", () => {
    it("should return the AppPlatform for Android, iOS, and web App IDs", () => {
      expect(parseAppPlatform("1:1234567890:android:abcdef")).to.equal(AppPlatform.ANDROID);
      expect(parseAppPlatform("1:1234567890:ios:abcdef")).to.equal(AppPlatform.IOS);
      expect(parseAppPlatform("1:1234567890:web:abcdef")).to.equal(AppPlatform.WEB);
      expect(parseAppPlatform("1:1234567890:WEB:abcdef")).to.equal(AppPlatform.WEB);
    });

    it("should return undefined for missing or unrecognized App IDs", () => {
      expect(parseAppPlatform(undefined)).to.be.undefined;
      expect(parseAppPlatform("")).to.be.undefined;
      expect(parseAppPlatform("invalid-app-id")).to.be.undefined;
      expect(parseAppPlatform("1:1234567890:macos:abcdef")).to.be.undefined;
    });
  });

  describe("parsePlatform", () => {
    it("should map android and ios App IDs to PLATFORM_PATH", () => {
      expect(parsePlatform("1:1234567890:android:abcdef")).to.equal(PLATFORM_PATH.ANDROID);
      expect(parsePlatform("1:1234567890:ios:abcdef")).to.equal(PLATFORM_PATH.IOS);
    });

    it("should throw FirebaseError for malformed or non-mobile App IDs", () => {
      expect(() => parsePlatform("1:1234567890")).to.throw(
        FirebaseError,
        "Unable to get the platform from the AppId.",
      );
      expect(() => parsePlatform("1:1234567890:web:abcdef")).to.throw(
        FirebaseError,
        "Only android or ios apps are supported.",
      );
    });
  });
});
