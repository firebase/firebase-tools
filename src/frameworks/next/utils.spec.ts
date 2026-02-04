import { expect } from "chai";
import * as fs from "fs";
import * as fsPromises from "fs/promises";
import * as fsExtra from "fs-extra";
import * as sinon from "sinon";
import * as glob from "glob";
import * as childProcess from "child_process";
import { FirebaseError } from "../../error";

import {
  EXPORT_MARKER,
  IMAGES_MANIFEST,
  APP_PATH_ROUTES_MANIFEST,
  ESBUILD_VERSION,
  FUNCTIONS_CONFIG_MANIFEST,
  MIDDLEWARE_MANIFEST,
} from "./constants";

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
  getAppMetadataFromMetaFiles,
  isUsingNextImageInAppDirectory,
  getNextVersion,
  getNextVersionRaw,
  getRoutesWithServerAction,
  findEsbuildPath,
  installEsbuild,
  isNextJsVersionVulnerable,
} from "./utils";

import * as frameworksUtils from "../utils";
import * as fsUtils from "../../fsutils";

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
  serverReferenceManifest,
  middlewareV3ManifestWhenUsed,
  functionsConfigManifestWhenUsed,
  middlewareV3ManifestWhenNotUsed,
  functionsConfigManifestWhenNotUsed,
  middlewareV3ManifestWithDeprecatedMiddleware,
  pathsWithCustomRoutesInternalPrefix,
} from "./testing";

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

    describe("development", () => {
      it("should return true if using middleware", async () => {
        sandbox.stub(fsExtra, "pathExists").resolves(true);
        expect(await isUsingMiddleware("", true)).to.be.true;
      });

      it("should return false if not using middleware", async () => {
        sandbox.stub(fsExtra, "pathExists").resolves(false);
        expect(await isUsingMiddleware("", true)).to.be.false;
      });
    });

    describe("production (v2)", () => {
      it("should return true if using middleware", async () => {
        sandbox.stub(fsExtra, "readJSON").resolves(middlewareV2ManifestWhenUsed);
        expect(await isUsingMiddleware("", false)).to.be.true;
      });

      it("should return false if not using middleware", async () => {
        sandbox.stub(fsExtra, "readJSON").resolves(middlewareV2ManifestWhenNotUsed);
        expect(await isUsingMiddleware("", false)).to.be.false;
      });
    });

    describe("production (v3)", () => {
      it("should return true if using middleware", async () => {
        const readJsonStub = sandbox.stub(frameworksUtils, "readJSON");
        readJsonStub
          .withArgs(sinon.match(MIDDLEWARE_MANIFEST))
          .resolves(middlewareV3ManifestWhenUsed);
        readJsonStub
          .withArgs(sinon.match(FUNCTIONS_CONFIG_MANIFEST))
          .resolves(functionsConfigManifestWhenUsed);

        expect(await isUsingMiddleware("", false)).to.be.true;
      });

      it("should return true if using deprecated middleware", async () => {
        const readJsonStub = sandbox.stub(frameworksUtils, "readJSON");
        readJsonStub
          .withArgs(sinon.match(MIDDLEWARE_MANIFEST))
          .resolves(middlewareV3ManifestWithDeprecatedMiddleware);
        readJsonStub
          .withArgs(sinon.match(FUNCTIONS_CONFIG_MANIFEST))
          .resolves(functionsConfigManifestWhenNotUsed);

        expect(await isUsingMiddleware("", false)).to.be.true;
      });

      it("should return false if not using middleware", async () => {
        const readJsonStub = sandbox.stub(frameworksUtils, "readJSON");
        readJsonStub
          .withArgs(sinon.match(MIDDLEWARE_MANIFEST))
          .resolves(middlewareV3ManifestWhenNotUsed);
        readJsonStub
          .withArgs(sinon.match(FUNCTIONS_CONFIG_MANIFEST))
          .resolves(functionsConfigManifestWhenNotUsed);

        expect(await isUsingMiddleware("", false)).to.be.false;
      });
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
    describe("middleware version 1", () => {
      it("should return regexes", () => {
        const middlewareMatcherRegexes = getMiddlewareMatcherRegexes(
          middlewareV1ManifestWhenUsed,
          functionsConfigManifestWhenNotUsed,
        );

        for (const regex of middlewareMatcherRegexes) {
          expect(regex).to.be.an.instanceOf(RegExp);
        }
      });

      it("should return empty array when unused", () => {
        const middlewareMatcherRegexes = getMiddlewareMatcherRegexes(
          middlewareV1ManifestWhenNotUsed,
          functionsConfigManifestWhenNotUsed,
        );

        expect(middlewareMatcherRegexes).to.eql([]);
      });
    });

    describe("middleware version 2", () => {
      it("should return regexes", () => {
        const middlewareMatcherRegexes = getMiddlewareMatcherRegexes(
          middlewareV2ManifestWhenUsed,
          functionsConfigManifestWhenNotUsed,
        );

        for (const regex of middlewareMatcherRegexes) {
          expect(regex).to.be.an.instanceOf(RegExp);
        }
      });

      it("should return empty array when unused", () => {
        const middlewareMatcherRegexes = getMiddlewareMatcherRegexes(
          middlewareV2ManifestWhenNotUsed,
          functionsConfigManifestWhenNotUsed,
        );

        expect(middlewareMatcherRegexes).to.eql([]);
      });
    });

    describe("middleware version 3", () => {
      it("should return regexes", () => {
        const middlewareMatcherRegexes = getMiddlewareMatcherRegexes(
          middlewareV3ManifestWhenUsed,
          functionsConfigManifestWhenUsed,
        );

        for (const regex of middlewareMatcherRegexes) {
          expect(regex).to.be.an.instanceOf(RegExp);
        }
      });

      it("should return empty array when unused", () => {
        const middlewareMatcherRegexes = getMiddlewareMatcherRegexes(
          middlewareV3ManifestWhenNotUsed,
          functionsConfigManifestWhenNotUsed,
        );

        expect(middlewareMatcherRegexes).to.eql([]);
      });

      it("should return regexes from deprecated manifest", () => {
        const middlewareMatcherRegexes = getMiddlewareMatcherRegexes(
          middlewareV3ManifestWithDeprecatedMiddleware,
          functionsConfigManifestWhenNotUsed,
        );

        for (const regex of middlewareMatcherRegexes) {
          expect(regex).to.be.an.instanceOf(RegExp);
        }
        expect(middlewareMatcherRegexes).to.have.length(1);
      });
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

  describe("getAppMetadataFromMetaFiles", () => {
    let sandbox: sinon.SinonSandbox;
    beforeEach(() => (sandbox = sinon.createSandbox()));
    afterEach(() => sandbox.restore());

    it("should return the correct headers and pprRoutes from meta files", async () => {
      const distDir = ".next";
      const readJsonStub = sandbox.stub(frameworksUtils, "readJSON");
      const dirExistsSyncStub = sandbox.stub(fsUtils, "dirExistsSync");
      const fileExistsSyncStub = sandbox.stub(fsUtils, "fileExistsSync");

      // /api/static
      dirExistsSyncStub.withArgs(`${distDir}/server/app/api/static`).returns(true);
      fileExistsSyncStub.withArgs(`${distDir}/server/app/api/static.meta`).returns(true);
      readJsonStub.withArgs(`${distDir}/server/app/api/static.meta`).resolves(metaFileContents);

      // /ppr
      dirExistsSyncStub.withArgs(`${distDir}/server/app/ppr`).returns(true);
      fileExistsSyncStub.withArgs(`${distDir}/server/app/ppr.meta`).returns(true);
      readJsonStub.withArgs(`${distDir}/server/app/ppr.meta`).resolves({
        ...metaFileContents,
        postponed: "true",
      });

      expect(
        await getAppMetadataFromMetaFiles(".", distDir, "/asdf", appPathRoutesManifest),
      ).to.deep.equal({
        headers: [
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
          {
            source: "/asdf/ppr",
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
        ],
        pprRoutes: ["/ppr"],
      });
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

  describe("getNextVersionRaw", () => {
    let sandbox: sinon.SinonSandbox;
    beforeEach(() => (sandbox = sinon.createSandbox()));
    afterEach(() => sandbox.restore());

    it("should get version", () => {
      sandbox.stub(frameworksUtils, "findDependency").returns({ version: "13.4.10" });

      expect(getNextVersionRaw("")).to.equal("13.4.10");
    });

    it("should return exact version including canary", () => {
      sandbox.stub(frameworksUtils, "findDependency").returns({ version: "13.4.10-canary.0" });

      expect(getNextVersionRaw("")).to.equal("13.4.10-canary.0");
    });

    it("should return undefined if unable to get version", () => {
      sandbox.stub(frameworksUtils, "findDependency").returns(undefined);

      expect(getNextVersionRaw("")).to.be.undefined;
    });
  });

  describe("getRoutesWithServerAction", () => {
    it("should get routes with server action", () => {
      expect(
        getRoutesWithServerAction(serverReferenceManifest, appPathRoutesManifest),
      ).to.deep.equal(["/another-s-a", "/server-action", "/server-action/edge"]);
    });
  });

  describe("findEsbuildPath", () => {
    let execSyncStub: sinon.SinonStub;

    beforeEach(() => {
      execSyncStub = sinon.stub(childProcess, "execSync");
    });

    afterEach(() => {
      execSyncStub.restore();
    });

    it("should return the correct esbuild path when esbuild is found", () => {
      const mockBinaryPath = "/path/to/.bin/esbuild";
      const expectedResolvedPath = "/path/to/esbuild";
      execSyncStub
        .withArgs("npx which esbuild", { encoding: "utf8" })
        .returns(mockBinaryPath + "\n");

      const esbuildPath = findEsbuildPath();

      expect(esbuildPath).to.equal(expectedResolvedPath);
    });

    it("should return null if esbuild is not found", () => {
      execSyncStub
        .withArgs("npx which esbuild", { encoding: "utf8" })
        .throws(new Error("not found"));

      const esbuildPath = findEsbuildPath();
      expect(esbuildPath).to.be.null;
    });

    it("should warn if global esbuild version does not match required version", () => {
      const mockBinaryPath = "/path/to/.bin/esbuild";
      const mockGlobalVersion = "1.2.3";
      execSyncStub
        .withArgs("npx which esbuild", { encoding: "utf8" })
        .returns(mockBinaryPath + "\n");
      execSyncStub
        .withArgs(`"${mockBinaryPath}" --version`, { encoding: "utf8" })
        .returns(`${mockGlobalVersion}\n`);

      const consoleWarnStub = sinon.stub(console, "warn");

      findEsbuildPath();
      expect(
        consoleWarnStub.calledWith(
          `Warning: Global esbuild version (${mockGlobalVersion}) does not match the required version (${ESBUILD_VERSION}).`,
        ),
      ).to.be.true;

      consoleWarnStub.restore();
    });
  });

  describe("installEsbuild", () => {
    let execSyncStub: sinon.SinonStub;

    beforeEach(() => {
      execSyncStub = sinon.stub(childProcess, "execSync");
    });
    afterEach(() => execSyncStub.restore());

    it("should successfully install esbuild", () => {
      execSyncStub
        .withArgs(`npm install esbuild@${ESBUILD_VERSION} --no-save`, { stdio: "inherit" })
        .returns("");

      installEsbuild(ESBUILD_VERSION);
      expect(execSyncStub.calledOnce).to.be.true;
    });

    it("should throw a FirebaseError if installation fails", () => {
      execSyncStub
        .withArgs(`npm install esbuild@${ESBUILD_VERSION} --no-save`, { stdio: "inherit" })
        .throws(new Error("Installation failed"));

      try {
        installEsbuild(ESBUILD_VERSION);
        expect.fail("Expected installEsbuild to throw");
      } catch (error) {
        const typedError = error as FirebaseError;
        expect(typedError).to.be.instanceOf(FirebaseError);
        expect(typedError.message).to.include("Failed to install esbuild");
      }
    });
  });

  describe("isNextJsVersionVulnerable", () => {
    describe("vulnerable versions", () => {
      it("should block vulnerable 15.0.x versions (< 15.0.5)", () => {
        expect(isNextJsVersionVulnerable("15.0.4")).to.be.true;
        expect(isNextJsVersionVulnerable("15.0.0")).to.be.true;
        expect(isNextJsVersionVulnerable("15.0.0-rc.1")).to.be.true;
        expect(isNextJsVersionVulnerable("15.0.0-canary.205")).to.be.true;
      });

      it("should block vulnerable 15.1.x versions (< 15.1.9)", () => {
        expect(isNextJsVersionVulnerable("15.1.8")).to.be.true;
        expect(isNextJsVersionVulnerable("15.1.0")).to.be.true;
        expect(isNextJsVersionVulnerable("15.1.1-canary.27")).to.be.true;
      });

      it("should block vulnerable 15.2.x versions (< 15.2.6)", () => {
        expect(isNextJsVersionVulnerable("15.2.5")).to.be.true;
        expect(isNextJsVersionVulnerable("15.2.0-canary.77")).to.be.true;
      });

      it("should block vulnerable 15.3.x versions (< 15.3.6)", () => {
        expect(isNextJsVersionVulnerable("15.3.5")).to.be.true;
        expect(isNextJsVersionVulnerable("15.3.0-canary.46")).to.be.true;
      });

      it("should block vulnerable 15.4.x versions (< 15.4.8)", () => {
        expect(isNextJsVersionVulnerable("15.4.7")).to.be.true;
        expect(isNextJsVersionVulnerable("15.4.2-canary.56")).to.be.true;
        expect(isNextJsVersionVulnerable("15.4.0-canary.130")).to.be.true;
      });

      it("should block vulnerable 15.5.x versions (< 15.5.7)", () => {
        expect(isNextJsVersionVulnerable("15.5.6")).to.be.true;
        expect(isNextJsVersionVulnerable("15.5.1-canary.39")).to.be.true;
      });

      it("should block vulnerable 16.0.x versions (< 16.0.7)", () => {
        expect(isNextJsVersionVulnerable("16.0.6")).to.be.true;
        expect(isNextJsVersionVulnerable("16.0.0-beta.0")).to.be.true;
        expect(isNextJsVersionVulnerable("16.0.0-canary.18")).to.be.true;
        expect(isNextJsVersionVulnerable("16.0.2-canary.34")).to.be.true;
      });

      it("should block vulnerable 14.x canary versions (>= 14.3.0-canary.77)", () => {
        expect(isNextJsVersionVulnerable("14.3.0-canary.77")).to.be.true;
        expect(isNextJsVersionVulnerable("14.3.0-canary.87")).to.be.true;
      });

      it("should treat pre-releases of patched versions as vulnerable (conservative)", () => {
        expect(isNextJsVersionVulnerable("15.0.5-canary.1")).to.be.true;
      });

      it("should block versions with build metadata if base is vulnerable", () => {
        expect(isNextJsVersionVulnerable("15.0.4+build123")).to.be.true;
      });
    });

    describe("safe versions", () => {
      it("should allow patched 15.0.x versions (>= 15.0.5)", () => {
        expect(isNextJsVersionVulnerable("15.0.5")).to.be.false;
        expect(isNextJsVersionVulnerable("15.0.6")).to.be.false;
      });

      it("should allow patched 15.1.x versions (>= 15.1.9)", () => {
        expect(isNextJsVersionVulnerable("15.1.9")).to.be.false;
      });

      it("should allow patched 15.2.x versions (>= 15.2.6)", () => {
        expect(isNextJsVersionVulnerable("15.2.6")).to.be.false;
      });

      it("should allow patched 15.3.x versions (>= 15.3.6)", () => {
        expect(isNextJsVersionVulnerable("15.3.6")).to.be.false;
      });

      it("should allow patched 15.4.x versions (>= 15.4.8)", () => {
        expect(isNextJsVersionVulnerable("15.4.8")).to.be.false;
      });

      it("should allow patched 15.5.x versions (>= 15.5.7)", () => {
        expect(isNextJsVersionVulnerable("15.5.7")).to.be.false;
      });

      it("should allow newer minor versions (e.g. 15.6.x)", () => {
        expect(isNextJsVersionVulnerable("15.6.0-canary.57")).to.be.false;
      });

      it("should allow patched 16.0.x versions (>= 16.0.7)", () => {
        expect(isNextJsVersionVulnerable("16.0.7")).to.be.false;
      });

      it("should allow newer 16.x minor versions (e.g. 16.1.x)", () => {
        expect(isNextJsVersionVulnerable("16.1.0-canary.12")).to.be.false;
      });

      it("should allow safe 14.x canary versions (< 14.3.0-canary.77)", () => {
        expect(isNextJsVersionVulnerable("14.3.0-canary.76")).to.be.false;
        expect(isNextJsVersionVulnerable("14.3.0-canary.43")).to.be.false;
        expect(isNextJsVersionVulnerable("14.2.0-canary.67")).to.be.false;
      });

      it("should allow stable 14.x versions (not vulnerable)", () => {
        expect(isNextJsVersionVulnerable("14.3.0")).to.be.false;
        expect(isNextJsVersionVulnerable("14.2.33")).to.be.false;
        expect(isNextJsVersionVulnerable("14.1.4")).to.be.false;
      });

      it("should allow unaffected older versions", () => {
        expect(isNextJsVersionVulnerable("13.5.11")).to.be.false;
        expect(isNextJsVersionVulnerable("12.3.7")).to.be.false;
      });

      it("should allow versions with build metadata if base is safe", () => {
        expect(isNextJsVersionVulnerable("15.0.5+build123")).to.be.false;
      });

      it("should return false for invalid versions (fail open)", () => {
        expect(isNextJsVersionVulnerable("invalid-version")).to.be.false;
        expect(isNextJsVersionVulnerable("")).to.be.false;
        expect(isNextJsVersionVulnerable(undefined as any)).to.be.false;
      });
    });
  });
});
