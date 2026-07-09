import { expect } from "chai";
import * as nock from "nock";
import * as sinon from "sinon";
import * as fs from "fs";

import * as appcheck from "./appcheck";
import { appCheckOrigin } from "../api";
import { FirebaseError } from "../error";
import * as ensureApiEnabled from "../ensureApiEnabled";

const PROJECT_ID = "test-project";
const APP_ID = "1:1234:web:abcd";

describe("gcp/appcheck", () => {
  afterEach(() => {
    nock.cleanAll();
    sinon.restore();
  });

  describe("resolveServiceId", () => {
    it("resolves a known alias to its resource ID", () => {
      expect(appcheck.resolveServiceId("firestore")).to.equal("firestore.googleapis.com");
      expect(appcheck.resolveServiceId("ailogic")).to.equal("firebasevertexai.googleapis.com");
    });

    it("passes through a known resource ID", () => {
      expect(appcheck.resolveServiceId("firestore.googleapis.com")).to.equal(
        "firestore.googleapis.com",
      );
    });

    it("throws on an unknown service", () => {
      expect(() => appcheck.resolveServiceId("firestor")).to.throw(
        FirebaseError,
        /Unknown service/,
      );
    });
  });

  describe("aliasForServiceId", () => {
    it("maps a resource ID back to its alias", () => {
      expect(appcheck.aliasForServiceId("firebasestorage.googleapis.com")).to.equal("storage");
    });

    it("falls back to the resource ID when unknown", () => {
      expect(appcheck.aliasForServiceId("unknown.googleapis.com")).to.equal(
        "unknown.googleapis.com",
      );
    });
  });

  describe("parseEnforcementMode", () => {
    it("accepts the three modes, case-insensitively", () => {
      expect(appcheck.parseEnforcementMode("off")).to.equal("off");
      expect(appcheck.parseEnforcementMode("UNENFORCED")).to.equal("unenforced");
      expect(appcheck.parseEnforcementMode("Enforced")).to.equal("enforced");
    });

    it("throws on an unknown mode", () => {
      expect(() => appcheck.parseEnforcementMode("on")).to.throw(
        FirebaseError,
        /Unknown enforcement mode/,
      );
    });
  });

  describe("isAutoEnforcedService", () => {
    it("is true for AI Logic and false for others", () => {
      expect(appcheck.isAutoEnforcedService("ailogic")).to.be.true;
      expect(appcheck.isAutoEnforcedService("firebasevertexai.googleapis.com")).to.be.true;
      expect(appcheck.isAutoEnforcedService("firestore")).to.be.false;
    });
  });

  describe("parseProviderType", () => {
    it("accepts a known provider", () => {
      expect(appcheck.parseProviderType("play-integrity")).to.equal("play-integrity");
    });

    it("throws on an unknown provider", () => {
      expect(() => appcheck.parseProviderType("nope")).to.throw(FirebaseError, /Unknown provider/);
    });
  });

  describe("providerSupportsPlatform / providersForPlatform", () => {
    it("treats reCAPTCHA Enterprise as a mobile and web provider", () => {
      expect(appcheck.providerSupportsPlatform("recaptcha-enterprise", "IOS")).to.be.true;
      expect(appcheck.providerSupportsPlatform("recaptcha-enterprise", "ANDROID")).to.be.true;
      expect(appcheck.providerSupportsPlatform("recaptcha-enterprise", "WEB")).to.be.true;
    });

    it("keeps reCAPTCHA v3 web-only", () => {
      expect(appcheck.providerSupportsPlatform("recaptcha-v3", "WEB")).to.be.true;
      expect(appcheck.providerSupportsPlatform("recaptcha-v3", "IOS")).to.be.false;
    });

    it("lists the providers valid for a platform", () => {
      expect(appcheck.providersForPlatform("ANDROID")).to.have.members([
        "play-integrity",
        "recaptcha-enterprise",
      ]);
      expect(appcheck.providersForPlatform("IOS")).to.have.members([
        "app-attest",
        "device-check",
        "recaptcha-enterprise",
      ]);
    });
  });

  describe("parseTokenTtl", () => {
    it("converts short durations to API Duration strings", () => {
      expect(appcheck.parseTokenTtl("1h")).to.equal("3600s");
      expect(appcheck.parseTokenTtl("30m")).to.equal("1800s");
      expect(appcheck.parseTokenTtl("3600s")).to.equal("3600s");
      expect(appcheck.parseTokenTtl("3600")).to.equal("3600s");
    });

    it("rounds to an integer number of seconds", () => {
      expect(appcheck.parseTokenTtl("1.5s")).to.equal("2s");
      expect(appcheck.parseTokenTtl("0.5m")).to.equal("30s");
    });

    it("throws on an invalid duration", () => {
      expect(() => appcheck.parseTokenTtl("soon")).to.throw(FirebaseError, /Invalid token TTL/);
    });
  });

  describe("formatTokenTtl", () => {
    it("formats Duration strings into short labels", () => {
      expect(appcheck.formatTokenTtl("3600s")).to.equal("1h");
      expect(appcheck.formatTokenTtl("1800s")).to.equal("30m");
      expect(appcheck.formatTokenTtl("90s")).to.equal("90s");
      expect(appcheck.formatTokenTtl(undefined)).to.equal("-");
    });
  });

  describe("resolveSecretFlag", () => {
    it("returns a literal value unchanged", () => {
      expect(appcheck.resolveSecretFlag("my-secret")).to.equal("my-secret");
    });

    it("reads and trims a value from an @file", () => {
      sinon.stub(fs, "existsSync").returns(true);
      sinon.stub(fs, "readFileSync").returns("file-secret\n");
      expect(appcheck.resolveSecretFlag("@/tmp/secret.txt")).to.equal("file-secret");
    });

    it("throws when the @file is missing", () => {
      sinon.stub(fs, "existsSync").returns(false);
      expect(() => appcheck.resolveSecretFlag("@/tmp/missing.txt")).to.throw(
        FirebaseError,
        /Secret file not found/,
      );
    });
  });

  describe("getService", () => {
    it("maps the API response to an AppCheckService", async () => {
      nock(appCheckOrigin())
        .get(`/v1/projects/${PROJECT_ID}/services/firestore.googleapis.com`)
        .reply(200, {
          name: `projects/${PROJECT_ID}/services/firestore.googleapis.com`,
          enforcementMode: "ENFORCED",
        });

      const svc = await appcheck.getService(PROJECT_ID, "firestore");

      expect(svc).to.deep.equal({
        serviceId: "firestore.googleapis.com",
        alias: "firestore",
        enforcement: "enforced",
      });
      expect(nock.isDone()).to.be.true;
    });
  });

  describe("listServices", () => {
    it("maps every service in the response", async () => {
      nock(appCheckOrigin())
        .get(`/v1/projects/${PROJECT_ID}/services`)
        .reply(200, {
          services: [
            {
              name: `projects/${PROJECT_ID}/services/firestore.googleapis.com`,
              enforcementMode: "ENFORCED",
            },
            {
              name: `projects/${PROJECT_ID}/services/firebasestorage.googleapis.com`,
              enforcementMode: "UNENFORCED",
            },
          ],
        });

      const services = await appcheck.listServices(PROJECT_ID);

      expect(services).to.deep.equal([
        { serviceId: "firestore.googleapis.com", alias: "firestore", enforcement: "enforced" },
        {
          serviceId: "firebasestorage.googleapis.com",
          alias: "storage",
          enforcement: "unenforced",
        },
      ]);
    });

    it("returns an empty array when there are no services", async () => {
      nock(appCheckOrigin()).get(`/v1/projects/${PROJECT_ID}/services`).reply(200, {});
      expect(await appcheck.listServices(PROJECT_ID)).to.deep.equal([]);
    });
  });

  describe("setServiceEnforcement", () => {
    it("PATCHes the enforcement mode with an updateMask", async () => {
      nock(appCheckOrigin())
        .patch(
          `/v1/projects/${PROJECT_ID}/services/firestore.googleapis.com`,
          (body: { enforcementMode?: string }) => body.enforcementMode === "ENFORCED",
        )
        .query({ updateMask: "enforcementMode" })
        .reply(200, {
          name: `projects/${PROJECT_ID}/services/firestore.googleapis.com`,
          enforcementMode: "ENFORCED",
        });

      const svc = await appcheck.setServiceEnforcement(PROJECT_ID, "firestore", "enforced");

      expect(svc.enforcement).to.equal("enforced");
      expect(nock.isDone()).to.be.true;
    });
  });

  describe("debug tokens", () => {
    it("creates a debug token", async () => {
      nock(appCheckOrigin())
        .post(
          `/v1/projects/${PROJECT_ID}/apps/${APP_ID}/debugTokens`,
          (body: { displayName?: string; token?: string }) =>
            body.displayName === "CI" && body.token === undefined,
        )
        .reply(200, {
          name: `projects/${PROJECT_ID}/apps/${APP_ID}/debugTokens/tok1`,
          displayName: "CI",
          token: "generated-token",
        });

      const token = await appcheck.createDebugToken(PROJECT_ID, APP_ID, "CI");

      expect(token.token).to.equal("generated-token");
      expect(nock.isDone()).to.be.true;
    });

    it("lists debug tokens", async () => {
      nock(appCheckOrigin())
        .get(`/v1/projects/${PROJECT_ID}/apps/${APP_ID}/debugTokens`)
        .reply(200, { debugTokens: [{ name: "a", displayName: "one" }] });

      const tokens = await appcheck.listDebugTokens(PROJECT_ID, APP_ID);
      expect(tokens).to.have.length(1);
    });

    it("deletes a debug token", async () => {
      nock(appCheckOrigin())
        .delete(`/v1/projects/${PROJECT_ID}/apps/${APP_ID}/debugTokens/tok1`)
        .reply(200, {});

      await appcheck.deleteDebugToken(PROJECT_ID, APP_ID, "tok1");
      expect(nock.isDone()).to.be.true;
    });
  });

  describe("getProviderConfig", () => {
    it("returns the config when present", async () => {
      nock(appCheckOrigin())
        .get(`/v1/projects/${PROJECT_ID}/apps/${APP_ID}/recaptchaEnterpriseConfig`)
        .reply(200, {
          name: `projects/${PROJECT_ID}/apps/${APP_ID}/recaptchaEnterpriseConfig`,
          siteKey: "key",
          tokenTtl: "1800s",
        });

      const config = await appcheck.getProviderConfig(PROJECT_ID, APP_ID, "recaptcha-enterprise");
      expect(config?.siteKey).to.equal("key");
    });

    it("returns null on a 404", async () => {
      nock(appCheckOrigin())
        .get(`/v1/projects/${PROJECT_ID}/apps/${APP_ID}/appAttestConfig`)
        .reply(404, {});

      const config = await appcheck.getProviderConfig(PROJECT_ID, APP_ID, "app-attest");
      expect(config).to.be.null;
    });
  });

  describe("listConfiguredProviders", () => {
    it("returns only the platform providers that have a config", async () => {
      nock(appCheckOrigin())
        .get(`/v1/projects/${PROJECT_ID}/apps/${APP_ID}/recaptchaEnterpriseConfig`)
        .reply(200, { siteKey: "key", tokenTtl: "1800s" });
      nock(appCheckOrigin())
        .get(`/v1/projects/${PROJECT_ID}/apps/${APP_ID}/recaptchaV3Config`)
        .reply(404, {});

      const configured = await appcheck.listConfiguredProviders(PROJECT_ID, APP_ID, "WEB");

      expect(configured).to.have.length(1);
      expect(configured[0].provider).to.equal("recaptcha-enterprise");
    });
  });

  describe("setProviderConfig", () => {
    it("PATCHes the config with an updateMask of the given fields", async () => {
      nock(appCheckOrigin())
        .patch(
          `/v1/projects/${PROJECT_ID}/apps/${APP_ID}/recaptchaEnterpriseConfig`,
          (body: { siteKey?: string }) => body.siteKey === "key",
        )
        .query({ updateMask: "siteKey" })
        .reply(200, { siteKey: "key" });

      const config = await appcheck.setProviderConfig(PROJECT_ID, APP_ID, "recaptcha-enterprise", {
        siteKey: "key",
      });
      expect(config.siteKey).to.equal("key");
      expect(nock.isDone()).to.be.true;
    });
  });

  describe("ensureAppCheckApiEnabled", () => {
    it("returns quietly when the API is already enabled", async () => {
      sinon.stub(ensureApiEnabled, "check").resolves(true);
      await appcheck.ensureAppCheckApiEnabled(PROJECT_ID, { nonInteractive: true });
    });

    it("throws with instructions in non-interactive mode when disabled", async () => {
      sinon.stub(ensureApiEnabled, "check").resolves(false);
      await expect(
        appcheck.ensureAppCheckApiEnabled(PROJECT_ID, { nonInteractive: true }),
      ).to.be.rejectedWith(FirebaseError, /not enabled/);
    });
  });
});
