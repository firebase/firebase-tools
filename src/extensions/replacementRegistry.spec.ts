import { expect } from "chai";
import { getExtensionReplacement, getDeprecationWarningMessage } from "./replacementRegistry";

describe("replacementRegistry", () => {
  describe("getExtensionReplacement", () => {
    it("should return replacement info for a known 1P extension with replacement", () => {
      const rep = getExtensionReplacement("firebase/firestore-send-email");
      expect(rep).to.not.be.undefined;
      expect(rep?.status).to.equal("REPLACEMENT_AVAILABLE");
      expect(rep?.npmPackage).to.equal("@firebase-function-kits/firestore-send-email");
    });

    it("should return replacement info for storage-resize-images kit", () => {
      const rep = getExtensionReplacement("firebase/storage-resize-images");
      expect(rep).to.not.be.undefined;
      expect(rep?.status).to.equal("REPLACEMENT_AVAILABLE");
      expect(rep?.npmPackage).to.equal("@firebase-function-kits/storage-resize-images");
    });

    it("should return undefined for unknown extension", () => {
      const rep = getExtensionReplacement("unknown/random-extension");
      expect(rep).to.be.undefined;
    });
  });

  describe("getDeprecationWarningMessage", () => {
    it("should format deprecation message when replacement is available", () => {
      const msg = getDeprecationWarningMessage("firebase/firestore-send-email");
      expect(msg).to.include("firebase/firestore-send-email");
      expect(msg).to.include("Recommended replacement: @firebase-function-kits/firestore-send-email");
    });
  });
});
