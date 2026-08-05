import { expect } from "chai";

import { buildProviderUpdate } from "./providers";
import { FirebaseError } from "../error";
import { ProviderFlags } from "./types";

function options(extra: ProviderFlags = {}): ProviderFlags {
  return extra;
}

describe("appcheck buildProviderUpdate", () => {
  it("masks only the fields the user passed", () => {
    const { update, updateMask } = buildProviderUpdate(
      "recaptcha-enterprise",
      options({ siteKey: "6Lc_abc" }),
    );
    expect(update).to.deep.equal({ siteKey: "6Lc_abc" });
    // No tokenTtl in the mask, so an existing TTL is left alone.
    expect(updateMask).to.deep.equal(["siteKey"]);
  });

  it("handles device-check as a pair", () => {
    const { update, updateMask } = buildProviderUpdate(
      "device-check",
      options({ keyId: "ABCD1234EF", privateKey: "raw-key" }),
    );
    expect(update).to.deep.equal({ keyId: "ABCD1234EF", privateKey: "raw-key" });
    expect(updateMask).to.have.members(["keyId", "privateKey"]);
  });

  it("rejects half a device-check pair", () => {
    expect(() => buildProviderUpdate("device-check", options({ keyId: "ABCD1234EF" }))).to.throw(
      FirebaseError,
      /needs both --key-id and --private-key/,
    );
    expect(() => buildProviderUpdate("device-check", options({ privateKey: "raw" }))).to.throw(
      FirebaseError,
      /needs both/,
    );
  });

  it("nests the reCAPTCHA Enterprise score under riskAnalysis", () => {
    const { update, updateMask } = buildProviderUpdate(
      "recaptcha-enterprise",
      options({ minScore: "0.7" }),
    );
    expect(update).to.deep.equal({ riskAnalysis: { minValidScore: 0.7 } });
    expect(updateMask).to.deep.equal(["riskAnalysis.minValidScore"]);
  });

  it("keeps the reCAPTCHA v3 score at the top level", () => {
    const { update, updateMask } = buildProviderUpdate(
      "recaptcha-v3",
      options({ minScore: "0.4" }),
    );
    expect(update).to.deep.equal({ minValidScore: 0.4 });
    expect(updateMask).to.deep.equal(["minValidScore"]);
  });

  it("builds the play-integrity settings", () => {
    const { update, updateMask } = buildProviderUpdate(
      "play-integrity",
      options({ minDeviceIntegrity: "strong", requireLicensed: true }),
    );
    expect(update).to.deep.equal({
      deviceIntegrity: { minDeviceRecognitionLevel: "MEETS_STRONG_INTEGRITY" },
      accountDetails: { requireLicensed: true },
    });
    expect(updateMask).to.have.members([
      "deviceIntegrity.minDeviceRecognitionLevel",
      "accountDetails.requireLicensed",
    ]);
  });

  it("accepts token ttl for every provider, including app-attest", () => {
    const { update, updateMask } = buildProviderUpdate("app-attest", options({ tokenTtl: "2h" }));
    expect(update).to.deep.equal({ tokenTtl: "7200s" });
    expect(updateMask).to.deep.equal(["tokenTtl"]);
  });

  it("refuses a call that would change nothing", () => {
    expect(() => buildProviderUpdate("app-attest", options({}))).to.throw(
      FirebaseError,
      /Nothing to set for app-attest/,
    );
    // Flags that belong to another provider do not count.
    expect(() => buildProviderUpdate("recaptcha-v3", options({ keyId: "ABCD" }))).to.throw(
      FirebaseError,
      /Nothing to set/,
    );
  });

  it("validates values before building anything", () => {
    expect(() => buildProviderUpdate("recaptcha-v3", options({ minScore: "2" }))).to.throw(
      FirebaseError,
      /between 0\.0 and 1\.0/,
    );
    expect(() => buildProviderUpdate("app-attest", options({ tokenTtl: "10m" }))).to.throw(
      FirebaseError,
      /between 30 minutes/,
    );
  });
});
