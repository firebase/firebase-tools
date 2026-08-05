import { expect } from "chai";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { FirebaseError } from "../error";
import {
  assertProviderSupportsPlatform,
  buildProviderUpdate,
  formatTokenTtl,
  isConfigured,
  parseProviderType,
  providersForPlatform,
  summarizeConfig,
} from "./providers";

describe("appcheck providers helpers", () => {
  describe("parseProviderType", () => {
    it("accepts the five providers", () => {
      for (const p of [
        "app-attest",
        "device-check",
        "play-integrity",
        "recaptcha-enterprise",
        "recaptcha-v3",
      ]) {
        expect(parseProviderType(p)).to.equal(p);
      }
    });

    it("rejects anything else and lists the valid ones", () => {
      expect(() => parseProviderType("safetynet")).to.throw(FirebaseError, /Unknown provider/);
      expect(() => parseProviderType("recaptcha")).to.throw(FirebaseError, /recaptcha-v3/);
    });
  });

  describe("platforms", () => {
    it("knows which providers fit which platform", () => {
      expect(providersForPlatform("IOS")).to.have.members([
        "app-attest",
        "device-check",
        "recaptcha-enterprise",
      ]);
      expect(providersForPlatform("ANDROID")).to.have.members([
        "play-integrity",
        "recaptcha-enterprise",
      ]);
      expect(providersForPlatform("WEB")).to.have.members(["recaptcha-enterprise", "recaptcha-v3"]);
    });

    it("treats reCAPTCHA Enterprise as a mobile provider too", () => {
      // It became an iOS and Android provider in June 2026.
      expect(providersForPlatform("IOS")).to.include("recaptcha-enterprise");
      expect(providersForPlatform("ANDROID")).to.include("recaptcha-enterprise");
      expect(providersForPlatform("IOS")).to.not.include("recaptcha-v3");
    });

    it("explains a platform mismatch and suggests what fits", () => {
      expect(() => assertProviderSupportsPlatform("app-attest", "WEB", "app-1")).to.throw(
        FirebaseError,
        /app-attest is a IOS provider[\s\S]*recaptcha-enterprise, recaptcha-v3/,
      );
      expect(() => assertProviderSupportsPlatform("recaptcha-v3", "WEB", "app-1")).to.not.throw();
    });
  });

  describe("isConfigured", () => {
    it("uses the secret fields as the evidence", () => {
      expect(isConfigured("device-check", { privateKeySet: true })).to.be.true;
      expect(isConfigured("device-check", {})).to.be.false;
      expect(isConfigured("recaptcha-v3", { siteSecretSet: true })).to.be.true;
      expect(isConfigured("recaptcha-v3", { minValidScore: 0.5 })).to.be.false;
      expect(isConfigured("recaptcha-enterprise", { siteKey: "6Lc" })).to.be.true;
      expect(isConfigured("recaptcha-enterprise", { tokenTtl: "3600s" })).to.be.false;
    });

    it("cannot tell for the providers with no secret", () => {
      // Their config always exists with defaults, so there is nothing to check.
      expect(isConfigured("app-attest", { tokenTtl: "3600s" })).to.be.null;
      expect(isConfigured("play-integrity", {})).to.be.null;
    });
  });

  describe("token ttl", () => {
    const ttl = (tokenTtl: string): string | undefined =>
      buildProviderUpdate("app-attest", { tokenTtl }).update.tokenTtl;

    it("converts the units to seconds", () => {
      expect(ttl("30m")).to.equal("1800s");
      expect(ttl("1h")).to.equal("3600s");
      expect(ttl("1d")).to.equal("86400s");
      expect(ttl("3600s")).to.equal("3600s");
    });

    it("rejects a bad shape or a value outside 30m to 7d", () => {
      expect(() => ttl("1 hour")).to.throw(FirebaseError, /Use a number followed by/);
      expect(() => ttl("29m")).to.throw(FirebaseError, /between 30 minutes/);
      expect(() => ttl("8d")).to.throw(FirebaseError, /7 days/);
    });
  });

  describe("formatTokenTtl", () => {
    it("shows seconds back in the largest round unit", () => {
      expect(formatTokenTtl("3600s")).to.equal("1h");
      expect(formatTokenTtl("86400s")).to.equal("1d");
      expect(formatTokenTtl("1800s")).to.equal("30m");
      expect(formatTokenTtl(undefined)).to.equal("default");
    });
  });

  describe("secret flags", () => {
    const secret = (siteSecret: string): string | undefined =>
      buildProviderUpdate("recaptcha-v3", { siteSecret }).update.siteSecret;

    it("passes a plain value through", () => {
      expect(secret("secret-value")).to.equal("secret-value");
    });

    it("reads @file and trims it", () => {
      const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "appcheck-")), "key.p8");
      fs.writeFileSync(file, "key-contents\n");
      expect(secret(`@${file}`)).to.equal("key-contents");
      fs.rmSync(path.dirname(file), { recursive: true, force: true });
    });

    it("says which file is missing", () => {
      expect(() => secret("@/no/such/file.p8")).to.throw(
        FirebaseError,
        /File not found: \/no\/such\/file\.p8/,
      );
    });
  });

  describe("min score", () => {
    const score = (minScore: string): number | undefined =>
      buildProviderUpdate("recaptcha-v3", { minScore }).update.minValidScore;

    it("accepts 0 to 1 and rejects the rest", () => {
      expect(score("0.7")).to.equal(0.7);
      expect(score("0")).to.equal(0);
      expect(score("1")).to.equal(1);
      expect(() => score("1.5")).to.throw(FirebaseError, /between 0\.0 and 1\.0/);
      expect(() => score("high")).to.throw(FirebaseError);
    });
  });

  describe("device integrity level", () => {
    const level = (minDeviceIntegrity: string): string | undefined =>
      buildProviderUpdate("play-integrity", { minDeviceIntegrity }).update.deviceIntegrity
        ?.minDeviceRecognitionLevel;

    it("maps the short words to the API enum", () => {
      expect(level("basic")).to.equal("MEETS_BASIC_INTEGRITY");
      expect(level("STRONG")).to.equal("MEETS_STRONG_INTEGRITY");
      expect(() => level("medium")).to.throw(FirebaseError, /Must be one of/);
    });
  });

  describe("summarizeConfig", () => {
    it("describes what is set", () => {
      expect(summarizeConfig("device-check", { keyId: "ABCD" })).to.equal("key id: ABCD");
      expect(
        summarizeConfig("recaptcha-enterprise", {
          siteKey: "6Lc",
          riskAnalysis: { minValidScore: 0.7 },
        }),
      ).to.equal("site key: 6Lc, min score: 0.7");
      expect(summarizeConfig("app-attest", { tokenTtl: "3600s" })).to.equal("");
    });
  });
});
