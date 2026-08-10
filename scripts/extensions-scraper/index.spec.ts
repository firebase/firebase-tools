import { expect } from "chai";
import {
  extractReplacementFromReadme,
  getRepoUrlForExtension,
  processExtensionReadmes,
  toRawGithubUrl,
} from "./index";
import { ReplacementRegistrySchema } from "../../src/extensions/replacementRegistry";

describe("extensions-scraper", () => {
  describe("extractReplacementFromReadme", () => {
    it("should extract package name from 1P extension tag", () => {
      const readme = `
<!-- FIREBASE_EXTENSION_REPLACEMENT: extension="firebase/firestore-send-email" package="@firebase/firestore-send-email" -->
> Deprecation notice: Migrate to package.
      `;
      const pkg = extractReplacementFromReadme(readme);
      expect(pkg).to.equal("@firebase/firestore-send-email");
    });

    it("should extract package name from 2P partner tag with single quotes", () => {
      const readme = `
<!-- FIREBASE_EXTENSION_REPLACEMENT: extension='stripe/firestore-stripe-payments' package='@stripe/firestore-stripe-payments' -->
      `;
      const pkg = extractReplacementFromReadme(readme);
      expect(pkg).to.equal("@stripe/firestore-stripe-payments");
    });
  });

  describe("toRawGithubUrl", () => {
    it("should convert github.com tree URLs to raw.githubusercontent.com", () => {
      const webUrl =
        "https://github.com/firebase/extensions/tree/main/firestore-send-email/README.md";
      expect(toRawGithubUrl(webUrl)).to.equal(
        "https://raw.githubusercontent.com/firebase/extensions/main/firestore-send-email/README.md",
      );
    });

    it("should convert github.com blob URLs to raw.githubusercontent.com", () => {
      const webUrl = "https://github.com/firebase/firestore-bundle-builder/blob/master/README.md";
      expect(toRawGithubUrl(webUrl)).to.equal(
        "https://raw.githubusercontent.com/firebase/firestore-bundle-builder/master/README.md",
      );
    });
  });

  describe("getRepoUrlForExtension", () => {
    it("should resolve 1P firebase extensions to github.com repo tree", () => {
      const url = getRepoUrlForExtension("firebase/firestore-send-email");
      expect(url).to.equal(
        "https://github.com/firebase/extensions/tree/main/firestore-send-email/README.md",
      );
    });

    it("should resolve 2P partner extensions using explicit extensionRepositoryUrl", () => {
      const url = getRepoUrlForExtension("stripe/firestore-stripe-payments", {
        extensionRepositoryUrl:
          "https://github.com/stripe/stripe-firebase-extensions/tree/main/firestore-stripe-payments/README.md",
      });
      expect(url).to.equal(
        "https://github.com/stripe/stripe-firebase-extensions/tree/main/firestore-stripe-payments/README.md",
      );
    });
  });

  describe("processExtensionReadmes", () => {
    it("should update registry when valid replacement tags are found", () => {
      const readmes = {
        "firebase/firestore-send-email":
          '<!-- FIREBASE_EXTENSION_REPLACEMENT: package="@firebase/firestore-send-email" -->',
      };
      const initialRegistry: ReplacementRegistrySchema = {
        replacements: {
          "firebase/firestore-send-email": { status: "PENDING_PUBLISHER" },
        },
      };

      const { updatedRegistry, results } = processExtensionReadmes(readmes, initialRegistry);
      expect(results[0].status).to.equal("REPLACEMENT_AVAILABLE");
      expect(updatedRegistry.replacements["firebase/firestore-send-email"]).to.deep.equal({
        status: "REPLACEMENT_AVAILABLE",
        npmPackage: "@firebase/firestore-send-email",
      });
    });
  });
});
