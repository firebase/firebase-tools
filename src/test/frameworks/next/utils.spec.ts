import { expect } from "chai";

import {
  pathHasRegex,
  cleanEscapedChars,
  isRewriteSupportedByFirebase,
  isRedirectSupportedByFirebase,
  isHeaderSupportedByFirebase,
} from "../../../frameworks/next/utils";
import {
  pathsAsGlobs,
  pathsWithEscapedChars,
  pathsWithRegex,
  pathsWithRegexAndEscapedChars,
  supportedHeaders,
  supportedRedirects,
  supportedRewritesArray,
  unsupportedHeaders,
  unsupportedRedirects,
  unsupportedRewritesArray,
} from "./helpers";

describe("Next.js utils", () => {
  describe("pathHasRegex", () => {
    it("should identify regex", () => {
      for (const path of pathsWithRegex) {
        expect(pathHasRegex(path)).to.be.true;
      }
    });

    it("should not identify escaped parentheses as regex", () => {
      for (const path of pathsWithEscapedChars) {
        expect(pathHasRegex(path)).to.be.false;
      }
    });

    it("should identify regex along with escaped chars", () => {
      for (const path of pathsWithRegexAndEscapedChars) {
        expect(pathHasRegex(path)).to.be.true;
      }
    });

    it("should not identify globs as regex", () => {
      for (const path of pathsAsGlobs) {
        expect(pathHasRegex(path)).to.be.false;
      }
    });
  });

  describe("cleanEscapedChars", () => {
    it("should clean escaped chars", () => {
      for (const path of pathsWithRegexAndEscapedChars) {
        expect(cleanEscapedChars(path).includes("\\")).to.be.false;
      }
    });
  });

  describe("isRewriteSupportedByFirebase", () => {
    it("should allow supported rewrites", () => {
      for (const rewrite of supportedRewritesArray) {
        expect(isRewriteSupportedByFirebase(rewrite)).to.be.true;
      }
    });

    it("should disallow unsupported rewrites", () => {
      for (const rewrite of unsupportedRewritesArray) {
        expect(isRewriteSupportedByFirebase(rewrite)).to.be.false;
      }
    });
  });

  describe("isRedirectSupportedByFirebase", () => {
    it("should allow supported redirects", () => {
      for (const redirect of supportedRedirects) {
        expect(isRedirectSupportedByFirebase(redirect)).to.be.true;
      }
    });

    it("should disallow unsupported redirects", () => {
      for (const redirect of unsupportedRedirects) {
        expect(isRedirectSupportedByFirebase(redirect)).to.be.false;
      }
    });
  });

  describe("isHeaderSupportedByFirebase", () => {
    it("should allow supported headers", () => {
      for (const header of supportedHeaders) {
        expect(isHeaderSupportedByFirebase(header)).to.be.true;
      }
    });

    it("should disallow unsupported headers", () => {
      for (const header of unsupportedHeaders) {
        expect(isHeaderSupportedByFirebase(header)).to.be.false;
      }
    });
  });

});
