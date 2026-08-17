import { expect } from "chai";
import { getExtensionReplacement, getDeprecationWarningMessage } from "./replacementRegistry";

describe("replacementRegistry", () => {
  describe("getExtensionReplacement", () => {
    it("should return replacement info for a known 1P extension", () => {
      const rep = getExtensionReplacement("firebase/firestore-send-email");
      expect(rep).to.not.be.undefined;
      expect(rep?.extensionRepositoryUrl).to.be.a("string").that.is.not.empty;
    });

    it("should return replacement info for confirmed no replacement extension", () => {
      const rep = getExtensionReplacement("moralis/moralis-streams");
      expect(rep).to.not.be.undefined;
      expect(rep?.status).to.equal("CONFIRMED_NO_REPLACEMENT");
      expect(rep?.npmPackage).to.be.undefined;
    });

    it("should return undefined for unknown extension", () => {
      const rep = getExtensionReplacement("unknown/random-extension");
      expect(rep).to.be.undefined;
    });
  });

  describe("getDeprecationWarningMessage", () => {
    it("should format deprecation message for known extension", () => {
      const msg = getDeprecationWarningMessage("firebase/firestore-send-email");
      expect(msg).to.include("firebase/firestore-send-email");
      expect(msg).to.include("deprecated and will be decommissioned");
    });

    it("should format deprecation message when no replacement is planned", () => {
      const msg = getDeprecationWarningMessage("moralis/moralis-streams");
      expect(msg).to.include("moralis/moralis-streams");
      expect(msg).to.include("No npm package replacement is planned");
    });

    it("should return undefined for unknown extension", () => {
      const msg = getDeprecationWarningMessage("unknown/random-extension");
      expect(msg).to.be.undefined;
    });
  });
});
