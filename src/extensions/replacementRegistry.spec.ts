import { expect } from "chai";
import * as sinon from "sinon";

import {
  getExtensionReplacement,
  getDeprecationWarningMessage,
  getReplacementsRegistry,
  getReplacementPackageName,
  ReplacementRegistrySchema,
} from "./replacementRegistry";
import * as defaultReplacements from "./replacements.json";

describe("replacementRegistry", () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("getReplacementsRegistry", () => {
    it("should return remote catalog when fetch succeeds", async () => {
      const mockData: ReplacementRegistrySchema = {
        replacements: {
          "firebase/storage-resize-images": {
            status: "REPLACEMENT_AVAILABLE",
            npmPackage: "@firebase-function-kits/storage-resize-images",
            extensionRepositoryUrl:
              "https://github.com/firebase/extensions/tree/kits/storage-resize-images/README.md",
          },
        },
      };

      const mockResponse = {
        ok: true,
        json: async () => mockData,
      } as unknown as Response;

      sandbox.stub(globalThis, "fetch").resolves(mockResponse);

      const registry = await getReplacementsRegistry();
      expect(registry).to.eql(mockData);
    });

    it("should fall back to bundled catalog when fetch throws a network error", async () => {
      sandbox.stub(globalThis, "fetch").rejects(new Error("Network error"));

      const registry = await getReplacementsRegistry();
      expect(registry).to.eql(defaultReplacements);
    });

    it("should fall back to bundled catalog when fetch returns non-200 status", async () => {
      const mockResponse = {
        ok: false,
        status: 404,
      } as unknown as Response;

      sandbox.stub(globalThis, "fetch").resolves(mockResponse);

      const registry = await getReplacementsRegistry();
      expect(registry).to.eql(defaultReplacements);
    });

    it("should fall back to bundled catalog when network request times out", async () => {
      const clock = sandbox.useFakeTimers();
      sandbox.stub(globalThis, "fetch").callsFake((_, init) => {
        return new Promise((_, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const err = new Error("The operation was aborted");
            err.name = "AbortError";
            reject(err);
          });
        });
      });

      const promise = getReplacementsRegistry();
      clock.tick(2005);
      const registry = await promise;
      expect(registry).to.eql(defaultReplacements);
      clock.restore();
    });
  });

  describe("getExtensionReplacement", () => {
    it("should return replacement info for a known 1P extension", () => {
      const rep = getExtensionReplacement("firebase/storage-resize-images");
      expect(rep).to.not.be.undefined;
      expect(rep?.status).to.equal("REPLACEMENT_AVAILABLE");
      expect(rep?.npmPackage).to.equal("@firebase-function-kits/storage-resize-images");
      expect(rep?.extensionRepositoryUrl).to.be.a("string").that.is.not.empty;
    });

    it("should return replacement info for confirmed no replacement extension", () => {
      const rep = getExtensionReplacement("moralis/moralis-streams");
      expect(rep).to.not.be.undefined;
      expect(rep?.status).to.equal("CONFIRMED_NO_REPLACEMENT");
      expect(rep?.npmPackage).to.be.undefined;
    });

    it("should return undefined for empty extensionRef", () => {
      const rep = getExtensionReplacement("");
      expect(rep).to.be.undefined;
    });

    it("should return undefined for unknown extension", () => {
      const rep = getExtensionReplacement("unknown/random-extension");
      expect(rep).to.be.undefined;
    });
  });

  describe("getReplacementPackageName", () => {
    it("should return npmPackage when replacement is available for extensionRef", () => {
      const pkg = getReplacementPackageName("firebase/storage-resize-images");
      expect(pkg).to.equal("@firebase-function-kits/storage-resize-images");
    });

    it("should return undefined when extension has no replacement", () => {
      const pkg = getReplacementPackageName("moralis/moralis-streams");
      expect(pkg).to.be.undefined;
    });

    it("should return undefined for empty or unknown extension", () => {
      expect(getReplacementPackageName("")).to.be.undefined;
      expect(getReplacementPackageName("unknown/random-extension")).to.be.undefined;
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
