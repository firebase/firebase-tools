import { expect } from "chai";
import * as sinon from "sinon";
import {
  base32Decode,
  generateTotpCode,
  generateTotpSecret,
  redactTotpSecrets,
  verifyTotpCode,
} from "./totp";

// The SHA1 secret from RFC 6238 Appendix B, "12345678901234567890" in base32.
const RFC_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

describe("totp", () => {
  describe("base32Decode", () => {
    it("should decode the RFC 6238 test secret", () => {
      expect(base32Decode(RFC_SECRET).toString("ascii")).to.equal("12345678901234567890");
    });

    it("should ignore case and trailing padding", () => {
      // RFC 4648 section 10 test vector.
      expect(base32Decode("mzxw6ytboi======").toString("ascii")).to.equal("foobar");
    });

    it("should reject characters outside the base32 alphabet", () => {
      expect(() => base32Decode("ABC1")).to.throw("Invalid base32 character");
    });
  });

  describe("generateTotpSecret", () => {
    it("should generate 160 bit base32 secrets", () => {
      const secret = generateTotpSecret();
      expect(secret).to.match(/^[A-Z2-7]{32}$/);
      expect(base32Decode(secret)).to.have.length(20);
      expect(generateTotpSecret()).not.to.equal(secret);
    });
  });

  describe("generateTotpCode", () => {
    // RFC 6238 Appendix B lists 8 digit codes. A 6 digit code is the same
    // truncated value modulo 10^6, which is the last 6 digits of each.
    const vectors: [number, string][] = [
      [59, "94287082"],
      [1111111109, "07081804"],
      [1111111111, "14050471"],
      [1234567890, "89005924"],
      [2000000000, "69279037"],
      [20000000000, "65353130"],
    ];
    for (const [timeSec, code] of vectors) {
      it(`should match the RFC 6238 test vector at T=${timeSec}`, () => {
        expect(generateTotpCode(RFC_SECRET, timeSec * 1000)).to.equal(code.slice(-6));
      });
    }
  });

  describe("verifyTotpCode", () => {
    let clock: sinon.SinonFakeTimers;
    beforeEach(() => {
      clock = sinon.useFakeTimers(1234567890 * 1000);
    });
    afterEach(() => clock.restore());

    it("should accept the current code", () => {
      expect(verifyTotpCode(RFC_SECRET, "005924", 0)).to.be.true;
    });

    it("should accept codes within the adjacent intervals only", () => {
      const code = generateTotpCode(RFC_SECRET);
      clock.tick(2 * 30 * 1000);
      expect(verifyTotpCode(RFC_SECRET, code, 1)).to.be.false;
      expect(verifyTotpCode(RFC_SECRET, code, 2)).to.be.true;
    });

    it("should reject a wrong code", () => {
      expect(verifyTotpCode(RFC_SECRET, "000000", 5)).to.be.false;
    });

    it("should skip intervals before the epoch", () => {
      clock.setSystemTime(0);
      expect(verifyTotpCode(RFC_SECRET, generateTotpCode(RFC_SECRET, 0), 5)).to.be.true;
    });
  });

  describe("redactTotpSecrets", () => {
    it("should drop the shared secret and keep everything else", () => {
      const enrollment = {
        mfaEnrollmentId: "enrollment-id",
        totpInfo: {},
        emulatorTotpSecret: RFC_SECRET,
      };
      const redacted: unknown = JSON.parse(JSON.stringify(redactTotpSecrets([enrollment])));
      expect(redacted).to.eql([{ mfaEnrollmentId: "enrollment-id", totpInfo: {} }]);
      expect(enrollment.emulatorTotpSecret).to.equal(RFC_SECRET);
      expect(redactTotpSecrets(undefined)).to.be.undefined;
    });
  });
});
