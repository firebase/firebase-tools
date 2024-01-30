import { expect } from "chai";
import * as fs from "fs";
import * as fsPromises from "fs/promises";
import * as fsExtra from "fs-extra";
import * as sinon from "sinon";
import * as glob from "glob";

import {
  EXPORT_MARKER,
  IMAGES_MANIFEST,
  APP_PATH_ROUTES_MANIFEST,
} from "../../../frameworks/next/constants";

import {
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
  cleanCustomRouteI18n,
  I18N_SOURCE,
  allDependencyNames,
  getMiddlewareMatcherRegexes,
  getNonStaticRoutes,
  getNonStaticServerComponents,
  getHeadersFromMetaFiles,
  isUsingNextImageInAppDirectory,
  getNextVersion,
} from "../../../frameworks/next/utils";

import * as frameworksUtils from "../../../frameworks/utils";
import * as fsUtils from "../../../fsutils";

import {
  exportMarkerWithImage,
  exportMarkerWithoutImage,
  imagesManifest,
  imagesManifestUnoptimized,
  middlewareV2ManifestWhenNotUsed,
  middlewareV2ManifestWhenUsed,
  supportedHeaders,
  supportedRedirects,
  supportedRewritesArray,
  supportedRewritesObject,
  unsupportedHeaders,
  unsupportedRedirects,
  unsupportedRewritesArray,
  npmLsReturn,
  middlewareV1ManifestWhenUsed,
  middlewareV1ManifestWhenNotUsed,
  pagesManifest,
  prerenderManifest,
  appPathsManifest,
  appPathRoutesManifest,
  metaFileContents,
  pageClientReferenceManifestWithImage,
  pageClientReferenceManifestWithoutImage,
  clientReferenceManifestWithImage,
  clientReferenceManifestWithoutImage,
} from "./helpers";
import { pathsWithCustomRoutesInternalPrefix } from "./helpers/i18n";

describe("Next.js utils", () => {
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

  it("should allow supported rewrites", () => {
    expect(
      [...supportedRewritesArray, ...unsupportedRewritesArray].filter((it) =>
        isRewriteSupportedByHosting(it),
      ),
    ).to.have.members(supportedRewritesArray);
  });

  describe("isRedirectSupportedByFirebase", () => {
    it("should allow supported redirects", () => {
      expect(
        [...supportedRedirects, ...unsupportedRedirects].filter((it) =>
          isRedirectSupportedByHosting(it),
        ),
      ).to.have.members(supportedRedirects);
    });
  });

  describe("isHeaderSupportedByFirebase", () => {
    it("should allow supported headers", () => {
      expect(
        [...supportedHeaders, ...unsupportedHeaders].filter((it) => isHeaderSupportedByHosting(it)),
      ).to.have.members(supportedHeaders);
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
      sandbox.stub(fsExtra, "readJSON").resolves(middlewareV2ManifestWhenUsed);
      expect(await isUsingMiddleware("", false)).to.be.true;
    });

    it("should return false if not using middleware in production", async () => {
      sandbox.stub(fsExtra, "readJSON").resolves(middlewareV2ManifestWhenNotUsed);
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

      expect(await isUsingImageOptimization("", "")).to.be.true;
    });

    it("should return false if isNextImageImported is false", async () => {
      const stub = sandbox.stub(frameworksUtils, "readJSON");
      stub.withArgs(EXPORT_MARKER).resolves(exportMarkerWithoutImage);

      expect(await isUsingImageOptimization("", "")).to.be.false;
    });

    it("should return false if `unoptimized` option is used", async () => {
      const stub = sandbox.stub(frameworksUtils, "readJSON");
      stub.withArgs(EXPORT_MARKER).resolves(exportMarkerWithImage);
      stub.withArgs(IMAGES_MANIFEST).resolves(imagesManifestUnoptimized);

      expect(await isUsingImageOptimization("", "")).to.be.false;
    });
  });

  describe("isUsingNextImageInAppDirectory", () => {
    describe("Next.js >= 13.4.10", () => {
      let sandbox: sinon.SinonSandbox;
      beforeEach(() => (sandbox = sinon.createSandbox()));
      afterEach(() => sandbox.restore());

      it("should return true when using next/image in the app directory", async () => {
        sandbox
          .stub(glob, "sync")
          .returns(["/path-to-app/.next/server/app/page_client-reference-manifest.js"]);
        sandbox.stub(fsPromises, "readFile").resolves(pageClientReferenceManifestWithImage);

        expect(await isUsingNextImageInAppDirectory("", "")).to.be.true;
      });

      it("should return false when not using next/image in the app directory", async () => {
        sandbox.stub(fsPromises, "readFile").resolves(pageClientReferenceManifestWithoutImage);
        const globStub = sandbox
          .stub(glob, "sync")
          .returns(["/path-to-app/.next/server/app/page_client-reference-manifest.js"]);

        expect(await isUsingNextImageInAppDirectory("", "")).to.be.false;

        globStub.restore();
        sandbox.stub(glob, "sync").returns([]);

        expect(await isUsingNextImageInAppDirectory("", "")).to.be.false;
      });
    });

    describe("Next.js < 13.4.10", () => {
      let sandbox: sinon.SinonSandbox;
      beforeEach(() => (sandbox = sinon.createSandbox()));
      afterEach(() => sandbox.restore());

      it("should return true when using next/image in the app directory", async () => {
        sandbox.stub(fsPromises, "readFile").resolves(clientReferenceManifestWithImage);
        sandbox
          .stub(glob, "sync")
          .returns(["/path-to-app/.next/server/client-reference-manifest.js"]);

        expect(await isUsingNextImageInAppDirectory("", "")).to.be.true;
      });

      it("should return false when not using next/image in the app directory", async () => {
        sandbox.stub(fsPromises, "readFile").resolves(clientReferenceManifestWithoutImage);
        sandbox.stub(glob, "sync").returns([]);

        expect(await isUsingNextImageInAppDirectory("", "")).to.be.false;
      });
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

  describe("cleanCustomRouteI18n", () => {
    it("should remove Next.js i18n prefix", () => {
      for (const path of pathsWithCustomRoutesInternalPrefix) {
        const cleanPath = cleanCustomRouteI18n(path);

        expect(!!path.match(I18N_SOURCE)).to.be.true;
        expect(!!cleanPath.match(I18N_SOURCE)).to.be.false;

        // should not keep double slashes
        expect(cleanPath.startsWith("//")).to.be.false;
      }
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

  describe("getMiddlewareMatcherRegexes", () => {
    it("should return regexes when using version 1", () => {
      const middlewareMatcherRegexes = getMiddlewareMatcherRegexes(middlewareV1ManifestWhenUsed);

      for (const regex of middlewareMatcherRegexes) {
        expect(regex).to.be.an.instanceOf(RegExp);
      }
    });

    it("should return empty array when using version 1 but not using middleware", () => {
      const middlewareMatcherRegexes = getMiddlewareMatcherRegexes(middlewareV1ManifestWhenNotUsed);

      expect(middlewareMatcherRegexes).to.eql([]);
    });

    it("should return regexes when using version 2", () => {
      const middlewareMatcherRegexes = getMiddlewareMatcherRegexes(middlewareV2ManifestWhenUsed);

      for (const regex of middlewareMatcherRegexes) {
        expect(regex).to.be.an.instanceOf(RegExp);
      }
    });

    it("should return empty array when using version 2 but not using middleware", () => {
      const middlewareMatcherRegexes = getMiddlewareMatcherRegexes(middlewareV2ManifestWhenNotUsed);

      expect(middlewareMatcherRegexes).to.eql([]);
    });
  });

  describe("getNonStaticRoutes", () => {
    it("should get non-static routes", () => {
      expect(
        getNonStaticRoutes(
          pagesManifest,
          Object.keys(prerenderManifest.routes),
          Object.keys(prerenderManifest.dynamicRoutes),
        ),
      ).to.deep.equal(["/dynamic/[dynamic-slug]"]);
    });
  });

  describe("getNonStaticServerComponents", () => {
    it("should get non-static server components", () => {
      expect(
        getNonStaticServerComponents(
          appPathsManifest,
          appPathRoutesManifest,
          Object.keys(prerenderManifest.routes),
          Object.keys(prerenderManifest.dynamicRoutes),
        ),
      ).to.deep.equal(new Set(["/api/test/route"]));
    });
  });

  describe("getHeadersFromMetaFiles", () => {
    let sandbox: sinon.SinonSandbox;
    beforeEach(() => (sandbox = sinon.createSandbox()));
    afterEach(() => sandbox.restore());

    it("should get headers from meta files", async () => {
      const distDir = ".next";
      const readJsonStub = sandbox.stub(frameworksUtils, "readJSON");
      const dirExistsSyncStub = sandbox.stub(fsUtils, "dirExistsSync");
      const fileExistsSyncStub = sandbox.stub(fsUtils, "fileExistsSync");

      dirExistsSyncStub.withArgs(`${distDir}/server/app/api/static`).returns(true);
      fileExistsSyncStub.withArgs(`${distDir}/server/app/api/static.meta`).returns(true);
      readJsonStub.withArgs(`${distDir}/server/app/api/static.meta`).resolves(metaFileContents);

      expect(
        await getHeadersFromMetaFiles(".", distDir, "/asdf", appPathRoutesManifest),
      ).to.deep.equal([
        {
          source: "/asdf/api/static",
          headers: [
            {
              key: "content-type",
              value: "application/json",
            },
            {
              key: "custom-header",
              value: "custom-value",
            },
          ],
        },
      ]);
    });
  });

  describe("getNextVersion", () => {
    let sandbox: sinon.SinonSandbox;
    beforeEach(() => (sandbox = sinon.createSandbox()));
    afterEach(() => sandbox.restore());

    it("should get version", () => {
      sandbox.stub(frameworksUtils, "findDependency").returns({ version: "13.4.10" });

      expect(getNextVersion("")).to.equal("13.4.10");
    });

    it("should ignore canary version", () => {
      sandbox.stub(frameworksUtils, "findDependency").returns({ version: "13.4.10-canary.0" });

      expect(getNextVersion("")).to.equal("13.4.10");
    });

    it("should return undefined if unable to get version", () => {
      sandbox.stub(frameworksUtils, "findDependency").returns(undefined);

      expect(getNextVersion("")).to.be.undefined;
    });
  });
});
