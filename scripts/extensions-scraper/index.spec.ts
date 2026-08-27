import { expect } from "chai";
import { ReplacementRegistrySchema } from "../../src/extensions/replacementRegistry";
import {
  extractReplacementFromReadme,
  getRepoUrlForExtension,
  processExtensionReadmes,
  toRawGithubUrl,
} from "./index";

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

    it("should return undefined when replacement tag is missing the package attribute", () => {
      const readme = `
<!-- FIREBASE_EXTENSION_REPLACEMENT: extension="firebase/firestore-send-email" target="npm" -->
## Migration Guide
Check out the replacement guide below.
      `;
      const pkg = extractReplacementFromReadme(readme);
      expect(pkg).to.be.undefined;
    });

    it("should return undefined for unrelated HTML comments in README", () => {
      const readme = `
<!-- TODO: update configuration instructions before v2 release -->
<!-- markdownlint-disable MD013 -->
# Firestore Extension
Standard documentation and configuration details.
      `;
      const pkg = extractReplacementFromReadme(readme);
      expect(pkg).to.be.undefined;
    });

    it("should return undefined for empty or whitespace content", () => {
      expect(extractReplacementFromReadme("")).to.be.undefined;
      expect(extractReplacementFromReadme("   \n\t  ")).to.be.undefined;
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

    it("should throw error for non-GitHub hosts", () => {
      expect(() => toRawGithubUrl("https://gitlab.com/owner/repo/README.md")).to.throw(
        "Unsupported host",
      );
    });

    it("should throw error for malformed URLs", () => {
      expect(() => toRawGithubUrl("not-a-valid-url")).to.throw(
        "Failed to convert to raw GitHub URL",
      );
    });
  });

  describe("getRepoUrlForExtension", () => {
    it("should return the mandatory extensionRepositoryUrl from the entry", () => {
      const url = getRepoUrlForExtension({
        status: "PENDING_PUBLISHER",
        extensionRepositoryUrl:
          "https://github.com/firebase/extensions/tree/main/firestore-send-email/README.md",
      });
      expect(url).to.equal(
        "https://github.com/firebase/extensions/tree/main/firestore-send-email/README.md",
      );
    });
  });

  describe("processExtensionReadmes", () => {
    it("should update registry when valid replacement tags are found", () => {
      const readmes = {
        "firebase/firestore-send-email":
          '<!-- FIREBASE_EXTENSION_REPLACEMENT: package="@firebase-function-kits/firestore-send-email" -->',
      };
      const initialRegistry: ReplacementRegistrySchema = {
        replacements: {
          "firebase/firestore-send-email": {
            status: "PENDING_PUBLISHER",
            extensionRepositoryUrl:
              "https://github.com/firebase/extensions/tree/main/firestore-send-email/README.md",
          },
        },
      };

      const { updatedRegistry, results } = processExtensionReadmes(readmes, initialRegistry);
      expect(results[0].status).to.equal("REPLACEMENT_AVAILABLE");
      expect(updatedRegistry.replacements["firebase/firestore-send-email"]).to.deep.equal({
        status: "REPLACEMENT_AVAILABLE",
        npmPackage: "@firebase-function-kits/firestore-send-email",
        extensionRepositoryUrl:
          "https://github.com/firebase/extensions/tree/main/firestore-send-email/README.md",
      });
    });
  });
});
