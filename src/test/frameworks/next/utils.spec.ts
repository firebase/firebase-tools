import { expect } from "chai";
import * as fs from "fs";
import * as fsExtra from "fs-extra";
import * as sinon from "sinon";

import {
  EXPORT_MARKER,
  IMAGES_MANIFEST,
  APP_PATH_ROUTES_MANIFEST,
} from "../../../frameworks/next/constants";
import {
  pathHasRegex,
  cleanEscapedChars,
  isRewriteSupportedByHosting,
  isRedirectSupportedByHosting,
  isHeaderSupportedByHosting,
  getNextjsRewritesToUse,
  usesAppDirRouter,
  usesNextImage,
  hasUnoptimizedImage,
  isUsingMiddleware,
  isUsingImageOptimization,
  isUsingAppDirectory,
  allDependencyNames,
} from "../../../frameworks/next/utils";
import * as frameworksUtils from "../../../frameworks/utils";
import * as fsUtils from "../../../fsutils";

import {
  exportMarkerWithImage,
  exportMarkerWithoutImage,
  imagesManifest,
  imagesManifestUnoptimized,
  middlewareManifestWhenNotUsed,
  middlewareManifestWhenUsed,
  pathsAsGlobs,
  pathsWithEscapedChars,
  pathsWithRegex,
  pathsWithRegexAndEscapedChars,
  supportedHeaders,
  supportedRedirects,
  supportedRewritesArray,
  supportedRewritesObject,
  unsupportedHeaders,
  unsupportedRedirects,
  unsupportedRewritesArray,
  npmLsReturn,
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
      // path containing all escaped chars
      const testPath = "/\\(\\)\\{\\}\\:\\+\\?\\*/:slug";

      expect(testPath.includes("\\(")).to.be.true;
      expect(cleanEscapedChars(testPath).includes("\\(")).to.be.false;

      expect(testPath.includes("\\)")).to.be.true;
      expect(cleanEscapedChars(testPath).includes("\\)")).to.be.false;

      expect(testPath.includes("\\{")).to.be.true;
      expect(cleanEscapedChars(testPath).includes("\\{")).to.be.false;

      expect(testPath.includes("\\}")).to.be.true;
      expect(cleanEscapedChars(testPath).includes("\\}")).to.be.false;

      expect(testPath.includes("\\:")).to.be.true;
      expect(cleanEscapedChars(testPath).includes("\\:")).to.be.false;

      expect(testPath.includes("\\+")).to.be.true;
      expect(cleanEscapedChars(testPath).includes("\\+")).to.be.false;

      expect(testPath.includes("\\?")).to.be.true;
      expect(cleanEscapedChars(testPath).includes("\\?")).to.be.false;

      expect(testPath.includes("\\*")).to.be.true;
      expect(cleanEscapedChars(testPath).includes("\\*")).to.be.false;
    });
  });

  describe("isRewriteSupportedByFirebase", () => {
    it("should allow supported rewrites", () => {
      for (const rewrite of supportedRewritesArray) {
        expect(isRewriteSupportedByHosting(rewrite)).to.be.true;
      }
    });

    it("should disallow unsupported rewrites", () => {
      for (const rewrite of unsupportedRewritesArray) {
        expect(isRewriteSupportedByHosting(rewrite)).to.be.false;
      }
    });
  });

  describe("isRedirectSupportedByFirebase", () => {
    it("should allow supported redirects", () => {
      for (const redirect of supportedRedirects) {
        expect(isRedirectSupportedByHosting(redirect)).to.be.true;
      }
    });

    it("should disallow unsupported redirects", () => {
      for (const redirect of unsupportedRedirects) {
        expect(isRedirectSupportedByHosting(redirect)).to.be.false;
      }
    });
  });

  describe("isHeaderSupportedByFirebase", () => {
    it("should allow supported headers", () => {
      for (const header of supportedHeaders) {
        expect(isHeaderSupportedByHosting(header)).to.be.true;
      }
    });

    it("should disallow unsupported headers", () => {
      for (const header of unsupportedHeaders) {
        expect(isHeaderSupportedByHosting(header)).to.be.false;
      }
    });
  });

  describe("getNextjsRewritesToUse", () => {
    it("should use only beforeFiles", () => {
      if (!supportedRewritesObject?.beforeFiles?.length) {
        throw new Error("beforeFiles must have rewrites");
      }

      const rewritesToUse = getNextjsRewritesToUse(supportedRewritesObject);

      for (const [i, rewrite] of supportedRewritesObject.beforeFiles.entries()) {
        expect(rewrite.source).to.equal(rewritesToUse[i].source);
        expect(rewrite.destination).to.equal(rewritesToUse[i].destination);
      }
    });

    it("should return all rewrites if in array format", () => {
      const rewritesToUse = getNextjsRewritesToUse(supportedRewritesArray);

      expect(rewritesToUse).to.have.length(supportedRewritesArray.length);
    });
  });

  describe("usesAppDirRouter", () => {
    let sandbox: sinon.SinonSandbox;

    beforeEach(() => {
      sandbox = sinon.createSandbox();
    });

    afterEach(() => {
      sandbox.restore();
    });

    it("should return false when app dir doesn't exist", () => {
      sandbox.stub(fs, "existsSync").returns(false);
      expect(usesAppDirRouter("")).to.be.false;
    });

    it("should return true when app dir does exist", () => {
      sandbox.stub(fs, "existsSync").returns(true);
      expect(usesAppDirRouter("")).to.be.true;
    });
  });

  describe("usesNextImage", () => {
    let sandbox: sinon.SinonSandbox;

    beforeEach(() => {
      sandbox = sinon.createSandbox();
    });

    afterEach(() => {
      sandbox.restore();
    });

    it("should return true when export marker has isNextImageImported", async () => {
      sandbox.stub(fsExtra, "readJSON").resolves({
        isNextImageImported: true,
      });
      expect(await usesNextImage("", "")).to.be.true;
    });

    it("should return false when export marker has !isNextImageImported", async () => {
      sandbox.stub(fsExtra, "readJSON").resolves({
        isNextImageImported: false,
      });
      expect(await usesNextImage("", "")).to.be.false;
    });
  });

  describe("hasUnoptimizedImage", () => {
    let sandbox: sinon.SinonSandbox;

    beforeEach(() => {
      sandbox = sinon.createSandbox();
    });

    afterEach(() => {
      sandbox.restore();
    });

    it("should return true when images manfiest indicates unoptimized", async () => {
      sandbox.stub(fsExtra, "readJSON").resolves({
        images: { unoptimized: true },
      });
      expect(await hasUnoptimizedImage("", "")).to.be.true;
    });

    it("should return true when images manfiest indicates !unoptimized", async () => {
      sandbox.stub(fsExtra, "readJSON").resolves({
        images: { unoptimized: false },
      });
      expect(await hasUnoptimizedImage("", "")).to.be.false;
    });
  });

  describe("isUsingMiddleware", () => {
    let sandbox: sinon.SinonSandbox;
    beforeEach(() => (sandbox = sinon.createSandbox()));
    afterEach(() => sandbox.restore());

    it("should return true if using middleware in development", async () => {
      sandbox.stub(fsExtra, "pathExists").resolves(true);
      expect(await isUsingMiddleware("", true)).to.be.true;
    });

    it("should return false if not using middleware in development", async () => {
      sandbox.stub(fsExtra, "pathExists").resolves(false);
      expect(await isUsingMiddleware("", true)).to.be.false;
    });

    it("should return true if using middleware in production", async () => {
      sandbox.stub(fsExtra, "readJSON").resolves(middlewareManifestWhenUsed);
      expect(await isUsingMiddleware("", false)).to.be.true;
    });

    it("should return false if not using middleware in production", async () => {
      sandbox.stub(fsExtra, "readJSON").resolves(middlewareManifestWhenNotUsed);
      expect(await isUsingMiddleware("", false)).to.be.false;
    });
  });

  describe("isUsingImageOptimization", () => {
    let sandbox: sinon.SinonSandbox;
    beforeEach(() => (sandbox = sinon.createSandbox()));
    afterEach(() => sandbox.restore());

    it("should return true if images optimization is used", async () => {
      const stub = sandbox.stub(frameworksUtils, "readJSON");
      stub.withArgs(EXPORT_MARKER).resolves(exportMarkerWithImage);
      stub.withArgs(IMAGES_MANIFEST).resolves(imagesManifest);

      expect(await isUsingImageOptimization("")).to.be.true;
    });

    it("should return false if isNextImageImported is false", async () => {
      const stub = sandbox.stub(frameworksUtils, "readJSON");
      stub.withArgs(EXPORT_MARKER).resolves(exportMarkerWithoutImage);

      expect(await isUsingImageOptimization("")).to.be.false;
    });

    it("should return false if `unoptimized` option is used", async () => {
      const stub = sandbox.stub(frameworksUtils, "readJSON");
      stub.withArgs(EXPORT_MARKER).resolves(exportMarkerWithImage);
      stub.withArgs(IMAGES_MANIFEST).resolves(imagesManifestUnoptimized);

      expect(await isUsingImageOptimization("")).to.be.false;
    });
  });

  describe("isUsingAppDirectory", () => {
    let sandbox: sinon.SinonSandbox;
    beforeEach(() => (sandbox = sinon.createSandbox()));
    afterEach(() => sandbox.restore());

    it(`should return true if ${APP_PATH_ROUTES_MANIFEST} exists`, () => {
      sandbox.stub(fsUtils, "fileExistsSync").returns(true);

      expect(isUsingAppDirectory("")).to.be.true;
    });

    it(`should return false if ${APP_PATH_ROUTES_MANIFEST} did not exist`, () => {
      sandbox.stub(fsUtils, "fileExistsSync").returns(false);

      expect(isUsingAppDirectory("")).to.be.false;
    });
  });

  describe("allDependencyNames", () => {
    it("should return empty on stopping conditions", () => {
      expect(allDependencyNames({})).to.eql([]);
      expect(allDependencyNames({ version: "foo" })).to.eql([]);
    });

    it("should return expected dependency names", () => {
      expect(allDependencyNames(npmLsReturn)).to.eql([
        "@next/font",
        "next",
        "@next/env",
        "@next/swc-android-arm-eabi",
        "@next/swc-android-arm64",
        "@next/swc-darwin-arm64",
        "@next/swc-darwin-x64",
        "@next/swc-freebsd-x64",
        "@next/swc-linux-arm-gnueabihf",
        "@next/swc-linux-arm64-gnu",
        "@next/swc-linux-arm64-musl",
        "@next/swc-linux-x64-gnu",
        "@next/swc-linux-x64-musl",
        "@next/swc-win32-arm64-msvc",
        "@next/swc-win32-ia32-msvc",
        "@next/swc-win32-x64-msvc",
        "@swc/helpers",
        "tslib",
        "caniuse-lite",
        "fibers",
        "node-sass",
        "postcss",
        "nanoid",
        "picocolors",
        "source-map-js",
        "react-dom",
        "react",
        "sass",
        "styled-jsx",
        "client-only",
        "react",
        "react-dom",
        "loose-envify",
        "js-tokens",
        "react",
        "scheduler",
        "loose-envify",
        "react",
        "loose-envify",
      ]);
    });
  });
});
