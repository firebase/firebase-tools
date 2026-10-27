import { expect } from "chai";
import * as sinon from "sinon";
import * as path from "path";
import * as fs from "fs-extra";

import {
  parseNpmPackageSpecifier,
  validateNpmPackageName,
  validateNpmPackageExists,
  sanitizePackageNameToKitName,
  isThirdPartyPackage,
  checkPackageHasShrinkwrap,
  promptSecurityConfirmation,
  scaffoldKitFiles,
  resolveSdkSpecifierToSave,
  getKitPackagesToSave,
  buildAndInstallKit,
  createNpmPackageAdapter,
  TemplateType,
} from "./npm";
import * as initSpawn from "../../../init/spawn";
import * as prompt from "../../../prompt";
import { Config } from "../../../config";
import { FirebaseError } from "../../../error";
import { ValidatedKitSingle } from "../../projectConfig";
import { logger } from "../../../logger";

describe("functions/kits/sources/npm", () => {
  let wrapSpawnStub: sinon.SinonStub;
  let spawnWithOutputStub: sinon.SinonStub;
  let loggerWarnStub: sinon.SinonStub;

  beforeEach(() => {
    wrapSpawnStub = sinon.stub(initSpawn, "wrapSpawn").resolves();
    spawnWithOutputStub = sinon
      .stub(initSpawn, "spawnWithOutput")
      .resolves(JSON.stringify([{ hasShrinkwrap: true }]));
    sinon.stub(fs, "ensureDir").resolves();
    sinon.stub(fs, "pathExists").resolves(false);
    sinon.stub(fs, "readJson").resolves({});
    loggerWarnStub = sinon.stub(logger, "warn");
  });

  afterEach(() => {
    sinon.restore();
  });

  function mockFs(files: Record<string, unknown>): void {
    (fs.pathExists as sinon.SinonStub).callsFake((p: string) => Promise.resolve(p in files));
    (fs.readJson as sinon.SinonStub).callsFake((p: string) => {
      const val = files[p];
      if (val instanceof Error) {
        return Promise.reject(val);
      }
      return Promise.resolve(val !== undefined ? val : {});
    });
  }

  describe("validateNpmPackageName", () => {
    it("should accept valid unscoped package names", () => {
      expect(() => validateNpmPackageName("my-kit")).to.not.throw();
      expect(() => validateNpmPackageName("firestore-export")).to.not.throw();
      expect(() => validateNpmPackageName("kit_123.v1")).to.not.throw();
    });

    it("should accept valid unscoped package specifiers with version or tag", () => {
      expect(() => validateNpmPackageName("my-kit@1.2.3")).to.not.throw();
      expect(() => validateNpmPackageName("my-kit@next")).to.not.throw();
      expect(() => validateNpmPackageName("my-kit@^2.0.0")).to.not.throw();
    });

    it("should accept valid scoped package names with exactly one slash", () => {
      expect(() =>
        validateNpmPackageName("@firebase-function-kits/firestore-bigquery-export"),
      ).to.not.throw();
      expect(() => validateNpmPackageName("@invertase/example-kit")).to.not.throw();
    });

    it("should accept valid scoped package specifiers with version or tag", () => {
      expect(() =>
        validateNpmPackageName("@firebase-function-kits/firestore-bigquery-export@1.0.0"),
      ).to.not.throw();
      expect(() =>
        validateNpmPackageName("@firebase-function-kits/firestore-bigquery-export@1.0.0-rc.1"),
      ).to.not.throw();
      expect(() =>
        validateNpmPackageName("@firebase-function-kits/firestore-bigquery-export@latest"),
      ).to.not.throw();
      expect(() =>
        validateNpmPackageName("@firebase-function-kits/firestore-bigquery-export@next"),
      ).to.not.throw();
    });

    it("should reject package names with multiple slashes", () => {
      expect(() => validateNpmPackageName("@scope/pkg/extra")).to.throw(
        FirebaseError,
        /Invalid NPM package name/,
      );
      expect(() => validateNpmPackageName("foo/bar/baz")).to.throw(
        FirebaseError,
        /Invalid NPM package name/,
      );
    });

    it("should reject unscoped package names containing slashes", () => {
      expect(() => validateNpmPackageName("foo/bar")).to.throw(
        FirebaseError,
        /Invalid NPM package name/,
      );
    });

    it("should reject empty or malformed package names", () => {
      expect(() => validateNpmPackageName("")).to.throw(FirebaseError, /Invalid NPM package name/);
      expect(() => validateNpmPackageName("@scope")).to.throw(
        FirebaseError,
        /Invalid NPM package name/,
      );
      expect(() => validateNpmPackageName("my-kit@")).to.throw(
        FirebaseError,
        /Invalid NPM package name/,
      );
      expect(() => validateNpmPackageName("@scope/my-kit@")).to.throw(
        FirebaseError,
        /Invalid NPM package name/,
      );
      expect(() => validateNpmPackageName("a".repeat(215))).to.throw(
        FirebaseError,
        /Invalid NPM package name/,
      );
    });
  });

  describe("resolveSdkSpecifierToSave", () => {
    it("should preserve exact pins with = prefix", () => {
      expect(resolveSdkSpecifierToSave("firebase-functions", "7.1.0", "7.1.0")).to.equal(
        "firebase-functions@=7.1.0",
      );
      expect(resolveSdkSpecifierToSave("firebase-functions", "=7.1.0", "7.1.0")).to.equal(
        "firebase-functions@=7.1.0",
      );
      expect(resolveSdkSpecifierToSave("firebase-functions", "v7.1.0", "7.1.0")).to.equal(
        "firebase-functions@=7.1.0",
      );
      expect(resolveSdkSpecifierToSave("firebase-functions", "7.1.0")).to.equal(
        "firebase-functions@=7.1.0",
      );
    });

    it("should preserve tilde ranges anchored to installed version", () => {
      expect(resolveSdkSpecifierToSave("firebase-functions", "~7.1.0", "7.1.2")).to.equal(
        "firebase-functions@~7.1.2",
      );
      expect(resolveSdkSpecifierToSave("firebase-functions", "~7.1.0")).to.equal(
        "firebase-functions@~7.1.0",
      );
    });

    it("should anchor caret ranges to installed version with ^", () => {
      expect(resolveSdkSpecifierToSave("firebase-functions", "^7.0.0", "7.3.2")).to.equal(
        "firebase-functions@^7.3.2",
      );
    });

    it("should anchor wide ranges to installed version with ^", () => {
      expect(resolveSdkSpecifierToSave("firebase-functions", ">=7.0.0", "7.3.2")).to.equal(
        "firebase-functions@^7.3.2",
      );
      expect(resolveSdkSpecifierToSave("firebase-functions", ">=7.0.0 <8.0.0", "7.3.2")).to.equal(
        "firebase-functions@^7.3.2",
      );
    });

    it("should preserve declared range when installed version is not available", () => {
      expect(resolveSdkSpecifierToSave("firebase-functions", "^7.0.0")).to.equal(
        "firebase-functions@^7.0.0",
      );
      expect(resolveSdkSpecifierToSave("firebase-functions", ">=7.0.0")).to.equal(
        "firebase-functions@>=7.0.0",
      );
    });
  });

  describe("parseNpmPackageSpecifier", () => {
    it("should parse scoped package with version", () => {
      const res = parseNpmPackageSpecifier(
        "@firebase-function-kits/firestore-bigquery-export@1.0.0",
      );
      expect(res).to.deep.equal({
        packageName: "@firebase-function-kits/firestore-bigquery-export",
        version: "1.0.0",
      });
    });

    it("should parse scoped package with release candidate version", () => {
      const res = parseNpmPackageSpecifier(
        "@firebase-function-kits/firestore-bigquery-export@1.0.0-rc.1",
      );
      expect(res).to.deep.equal({
        packageName: "@firebase-function-kits/firestore-bigquery-export",
        version: "1.0.0-rc.1",
      });
    });

    it("should parse scoped package with tag", () => {
      const res = parseNpmPackageSpecifier(
        "@firebase-function-kits/firestore-bigquery-export@latest",
      );
      expect(res).to.deep.equal({
        packageName: "@firebase-function-kits/firestore-bigquery-export",
        version: "latest",
      });
    });

    it("should parse scoped package without version", () => {
      const res = parseNpmPackageSpecifier("@firebase-function-kits/firestore-bigquery-export");
      expect(res).to.deep.equal({
        packageName: "@firebase-function-kits/firestore-bigquery-export",
      });
    });

    it("should parse non-scoped package with version", () => {
      const res = parseNpmPackageSpecifier("my-kit@^2.0.0");
      expect(res).to.deep.equal({
        packageName: "my-kit",
        version: "^2.0.0",
      });
    });

    it("should parse non-scoped package with tag", () => {
      const res = parseNpmPackageSpecifier("my-kit@next");
      expect(res).to.deep.equal({
        packageName: "my-kit",
        version: "next",
      });
    });

    it("should parse non-scoped package without version", () => {
      const res = parseNpmPackageSpecifier("my-kit");
      expect(res).to.deep.equal({
        packageName: "my-kit",
      });
    });
  });

  describe("validateNpmPackageExists", () => {
    it("should resolve when npm view returns a valid version", async () => {
      spawnWithOutputStub
        .withArgs("npm", ["view", "@firebase-function-kits/firestore-bigquery-export", "version"])
        .resolves("1.0.0\n");

      await expect(validateNpmPackageExists("@firebase-function-kits/firestore-bigquery-export")).to
        .not.be.rejected;
    });

    it("should throw FirebaseError when npm view fails", async () => {
      spawnWithOutputStub
        .withArgs("npm", ["view", "@firebase/my-silly-package", "version"])
        .rejects(
          new Error(
            "Error: spawn(npm, [view, @firebase/my-silly-package, version]) \n exited with code: 1",
          ),
        );

      await expect(validateNpmPackageExists("@firebase/my-silly-package")).to.be.rejectedWith(
        FirebaseError,
        "NPM package '@firebase/my-silly-package' could not be found in the npm registry. Please verify the package name and version.",
      );
    });

    it("should throw FirebaseError when npm view returns empty output", async () => {
      spawnWithOutputStub
        .withArgs("npm", ["view", "@firebase/empty-package", "version"])
        .resolves("   \n");

      await expect(validateNpmPackageExists("@firebase/empty-package")).to.be.rejectedWith(
        FirebaseError,
        "NPM package '@firebase/empty-package' could not be found in the npm registry. Please verify the package name and version.",
      );
    });

    it("should reject invalid package name format without spawning npm view", async () => {
      await expect(validateNpmPackageExists("my-kit@")).to.be.rejectedWith(
        FirebaseError,
        /Invalid NPM package name 'my-kit@'/,
      );

      expect(spawnWithOutputStub).to.not.have.been.called;
    });
  });

  describe("sanitizePackageNameToKitName", () => {
    it("should extract kit name from scoped package name", () => {
      expect(
        sanitizePackageNameToKitName("@firebase-function-kits/firestore-bigquery-export"),
      ).to.equal("firestore-bigquery-export");
      expect(sanitizePackageNameToKitName("@foo/bar")).to.equal("bar");
    });

    it("should extract kit name from scoped package specifier with version or tag", () => {
      expect(
        sanitizePackageNameToKitName("@firebase-function-kits/firestore-bigquery-export@1.0.0"),
      ).to.equal("firestore-bigquery-export");
      expect(
        sanitizePackageNameToKitName("@firebase-function-kits/firestore-bigquery-export@next"),
      ).to.equal("firestore-bigquery-export");
      expect(
        sanitizePackageNameToKitName(
          "@firebase-function-kits/firestore-bigquery-export@1.0.0-rc.1",
        ),
      ).to.equal("firestore-bigquery-export");
    });

    it("should sanitize non-scoped package name", () => {
      expect(sanitizePackageNameToKitName("my-kit")).to.equal("my-kit");
      expect(sanitizePackageNameToKitName("My_Kit!")).to.equal("my_kit");
    });

    it("should sanitize non-scoped package specifier with version or tag", () => {
      expect(sanitizePackageNameToKitName("my-kit@1.2.3")).to.equal("my-kit");
      expect(sanitizePackageNameToKitName("my-kit@next")).to.equal("my-kit");
    });

    it("should truncate long names to 40 characters", () => {
      const longName = "@scope/" + "a".repeat(50);
      expect(sanitizePackageNameToKitName(longName)).to.equal("a".repeat(40));
    });
  });

  describe("isThirdPartyPackage", () => {
    it("should return false for packages under @firebase-function-kits scope", () => {
      expect(isThirdPartyPackage("@firebase-function-kits/firestore-bigquery-export")).to.be.false;
      expect(isThirdPartyPackage("@firebase-function-kits/firestore-bigquery-export@1.0.0")).to.be
        .false;
      expect(isThirdPartyPackage("@firebase-function-kits/firestore-bigquery-export@next")).to.be
        .false;
    });

    it("should return true for packages outside @firebase-function-kits scope", () => {
      expect(isThirdPartyPackage("firebase-functions-kits")).to.be.true;
      expect(isThirdPartyPackage("@firebase-function-kits-fake/foo")).to.be.true;
      expect(isThirdPartyPackage("@other-scope/my-kit")).to.be.true;
      expect(isThirdPartyPackage("third-party-kit")).to.be.true;
      expect(isThirdPartyPackage("third-party-kit@1.2.3")).to.be.true;
      expect(isThirdPartyPackage("third-party-kit@next")).to.be.true;
    });
  });

  describe("checkPackageHasShrinkwrap", () => {
    it("should return true when npm pack output includes hasShrinkwrap", async () => {
      spawnWithOutputStub.resolves(JSON.stringify([{ hasShrinkwrap: true }]));
      const res = await checkPackageHasShrinkwrap("@firebase-function-kits/my-kit");
      expect(res).to.be.true;
    });

    it("should return true when npm pack files list includes npm-shrinkwrap.json", async () => {
      spawnWithOutputStub.resolves(JSON.stringify([{ files: [{ path: "npm-shrinkwrap.json" }] }]));
      const res = await checkPackageHasShrinkwrap("@firebase-function-kits/my-kit");
      expect(res).to.be.true;
    });

    it("should return false when npm-shrinkwrap.json is not in package", async () => {
      spawnWithOutputStub.resolves(JSON.stringify([{ files: [{ path: "package.json" }] }]));
      const res = await checkPackageHasShrinkwrap("@firebase-function-kits/my-kit");
      expect(res).to.be.false;
    });

    it("should return false when npm pack fails", async () => {
      spawnWithOutputStub.rejects(new Error("npm pack error"));
      const res = await checkPackageHasShrinkwrap("@firebase-function-kits/my-kit");
      expect(res).to.be.false;
    });
  });

  describe("promptSecurityConfirmation", () => {
    it("should return false without prompting for 1P package with shrinkwrap", async () => {
      spawnWithOutputStub.resolves(JSON.stringify([{ hasShrinkwrap: true }]));
      const confirmStub = sinon.stub(prompt, "confirm");

      const res = await promptSecurityConfirmation({
        rawPkgName: "@firebase-function-kits/my-kit",
        packageName: "@firebase-function-kits/my-kit",
      });

      expect(res).to.be.false;
      expect(confirmStub).to.not.have.been.called;
    });

    it("should prompt confirmation when a 1P kit lacks shrinkwrap", async () => {
      spawnWithOutputStub.resolves(JSON.stringify([{ files: [{ path: "package.json" }] }]));
      const confirmStub = sinon.stub(prompt, "confirm").resolves(true);

      const res = await promptSecurityConfirmation({
        rawPkgName: "@firebase-function-kits/my-kit",
        packageName: "@firebase-function-kits/my-kit",
      });

      expect(res).to.be.false;
      expect(confirmStub).to.have.been.calledOnceWith({
        message:
          "Are you sure you want to install @firebase-function-kits/my-kit without locked dependencies?",
        default: false,
        nonInteractive: undefined,
        force: undefined,
      });
      expect(loggerWarnStub).to.have.been.calledWith(
        sinon.match(/functions:/),
        sinon.match(/does not have an npm-shrinkwrap\.json file/),
      );
    });

    it("should pass force: true to confirm when 1P kit lacks shrinkwrap and force is true", async () => {
      spawnWithOutputStub.resolves(JSON.stringify([{ files: [{ path: "package.json" }] }]));
      const confirmStub = sinon.stub(prompt, "confirm").resolves(true);

      const res = await promptSecurityConfirmation({
        rawPkgName: "@firebase-function-kits/my-kit",
        packageName: "@firebase-function-kits/my-kit",
        force: true,
      });

      expect(res).to.be.false;
      expect(confirmStub).to.have.been.calledOnceWith({
        message:
          "Are you sure you want to install @firebase-function-kits/my-kit without locked dependencies?",
        default: false,
        nonInteractive: undefined,
        force: true,
      });
    });

    it("should prompt confirmation when a 3P kit has shrinkwrap", async () => {
      spawnWithOutputStub.resolves(JSON.stringify([{ hasShrinkwrap: true }]));
      const confirmStub = sinon.stub(prompt, "confirm").resolves(true);

      const res = await promptSecurityConfirmation({
        rawPkgName: "@third-party/custom-kit",
        packageName: "@third-party/custom-kit",
      });

      expect(res).to.be.true;
      expect(confirmStub).to.have.been.calledOnceWith({
        message: "Are you sure you want to install the third-party kit @third-party/custom-kit?",
        default: false,
        nonInteractive: undefined,
        force: undefined,
      });
      expect(loggerWarnStub).to.have.been.calledWith(
        sinon.match(/functions:/),
        sinon.match(/is a third-party kit/),
      );
    });

    it("should pass force: true to confirm when 3P kit has shrinkwrap and force is true", async () => {
      spawnWithOutputStub.resolves(JSON.stringify([{ hasShrinkwrap: true }]));
      const confirmStub = sinon.stub(prompt, "confirm").resolves(true);

      const res = await promptSecurityConfirmation({
        rawPkgName: "@third-party/custom-kit",
        packageName: "@third-party/custom-kit",
        force: true,
      });

      expect(res).to.be.true;
      expect(confirmStub).to.have.been.calledOnceWith({
        message: "Are you sure you want to install the third-party kit @third-party/custom-kit?",
        default: false,
        nonInteractive: undefined,
        force: true,
      });
    });

    it("should prompt confirmation when a 3P kit lacks shrinkwrap", async () => {
      spawnWithOutputStub.resolves(JSON.stringify([{ files: [{ path: "package.json" }] }]));
      const confirmStub = sinon.stub(prompt, "confirm").resolves(true);

      const res = await promptSecurityConfirmation({
        rawPkgName: "@third-party/custom-kit",
        packageName: "@third-party/custom-kit",
      });

      expect(res).to.be.true;
      expect(confirmStub).to.have.been.calledOnceWith({
        message:
          "Are you sure you want to install the third-party kit @third-party/custom-kit without locked dependencies?",
        default: false,
        nonInteractive: undefined,
        force: undefined,
      });
      expect(loggerWarnStub).to.have.been.calledWith(
        sinon.match(/functions:/),
        sinon.match(/is a third-party kit/),
      );
      expect(loggerWarnStub).to.have.been.calledWith(
        sinon.match(/functions:/),
        sinon.match(/does not have an npm-shrinkwrap\.json file/),
      );
    });

    it("should pass force: true to confirm when 3P kit lacks shrinkwrap and force is true", async () => {
      spawnWithOutputStub.resolves(JSON.stringify([{ files: [{ path: "package.json" }] }]));
      const confirmStub = sinon.stub(prompt, "confirm").resolves(true);

      const res = await promptSecurityConfirmation({
        rawPkgName: "@third-party/custom-kit",
        packageName: "@third-party/custom-kit",
        force: true,
      });

      expect(res).to.be.true;
      expect(confirmStub).to.have.been.calledOnceWith({
        message:
          "Are you sure you want to install the third-party kit @third-party/custom-kit without locked dependencies?",
        default: false,
        nonInteractive: undefined,
        force: true,
      });
    });

    it("should cancel installation if user declines confirmation", async () => {
      spawnWithOutputStub.resolves(JSON.stringify([{ files: [{ path: "package.json" }] }]));
      sinon.stub(prompt, "confirm").resolves(false);

      await expect(
        promptSecurityConfirmation({
          rawPkgName: "@firebase-function-kits/my-kit",
          packageName: "@firebase-function-kits/my-kit",
        }),
      ).to.be.rejectedWith(FirebaseError, "Installation cancelled.");
    });
  });

  describe("scaffoldKitFiles", () => {
    it("should scaffold kit source directory files without creating instance config directories", async () => {
      const writtenFiles: Record<string, unknown> = {};
      const mockConfig = {
        projectDir: "/mock/project",
        src: {},
        path: (rel: string) => path.join("/mock/project", rel),
        askWriteProjectFile: (file: string, content: unknown) => {
          writtenFiles[file] = content;
          return Promise.resolve();
        },
      } as unknown as Config;

      const paths = await scaffoldKitFiles({
        config: mockConfig,
        kitId: "my-kit",
        packageName: "@scope/pkg",
      });

      expect(paths.sourcePath).to.equal("function-kits/my-kit/source");
      expect(paths.absSourcePath).to.equal("/mock/project/function-kits/my-kit/source");
      expect(writtenFiles["function-kits/my-kit/source/package.json"]).to.deep.include({
        name: "my-kit-wrapper",
        dependencies: {},
      });
      expect(writtenFiles["function-kits/my-kit/source/tsconfig.json"]).to.be.a("string");
      expect(writtenFiles["function-kits/my-kit/source/.gitignore"]).to.be.a("string");
      expect(writtenFiles["function-kits/my-kit/source/src/index.ts"]).to.include("@scope/pkg");
    });

    it("should handle existing package.json containing null", async () => {
      mockFs({
        "/mock/project/function-kits/my-kit/source/package.json": null,
      });
      const writtenFiles: Record<string, unknown> = {};
      const mockConfig = {
        projectDir: "/mock/project",
        src: {},
        path: (rel: string) => path.join("/mock/project", rel),
        askWriteProjectFile: (file: string, content: unknown) => {
          writtenFiles[file] = content;
          return Promise.resolve();
        },
      } as unknown as Config;

      await scaffoldKitFiles({
        config: mockConfig,
        kitId: "my-kit",
        packageName: "@scope/pkg",
      });

      expect(writtenFiles["function-kits/my-kit/source/package.json"]).to.deep.equal({
        name: "my-kit-wrapper",
      });
    });
  });

  describe("buildAndInstallKit", () => {
    beforeEach(() => {
      mockFs({
        "/abs/path/package-lock.json": {
          packages: {
            "node_modules/@firebase-function-kits/my-kit": {
              peerDependencies: {
                "firebase-functions": "^7.0.0",
              },
            },
            "node_modules/third-party-kit": {
              peerDependencies: {
                "firebase-functions": "^7.0.0",
              },
            },
            "node_modules/my-kit": {
              peerDependencies: {
                "firebase-functions": "^7.0.0",
              },
            },
            "node_modules/firebase-functions": { version: "7.3.2" },
          },
        },
      });
    });

    it("should run npm install and npm run build without --ignore-scripts for first-party kit", async () => {
      await buildAndInstallKit("/abs/path", "@firebase-function-kits/my-kit", false);

      expect(wrapSpawnStub).to.have.been.calledThrice;
      expect(wrapSpawnStub.firstCall).to.have.been.calledWith(
        "npm",
        ["install", "@firebase-function-kits/my-kit", "--save-prefix=^"],
        "/abs/path",
      );
      expect(wrapSpawnStub.secondCall).to.have.been.calledWith(
        "npm",
        ["install", "firebase-functions@^7.3.2", "--save-prefix=^"],
        "/abs/path",
      );
      expect(wrapSpawnStub.thirdCall).to.have.been.calledWith("npm", ["run", "build"], "/abs/path");
    });

    it("should run npm install with --ignore-scripts for third-party kit", async () => {
      await buildAndInstallKit("/abs/path", "third-party-kit", true);

      expect(wrapSpawnStub).to.have.been.calledThrice;
      expect(wrapSpawnStub.firstCall).to.have.been.calledWith(
        "npm",
        ["install", "third-party-kit", "--save-prefix=^", "--ignore-scripts"],
        "/abs/path",
      );
      expect(wrapSpawnStub.secondCall).to.have.been.calledWith(
        "npm",
        ["install", "firebase-functions@^7.3.2", "--save-prefix=^", "--ignore-scripts"],
        "/abs/path",
      );
      expect(wrapSpawnStub.thirdCall).to.have.been.calledWith("npm", ["run", "build"], "/abs/path");
    });

    it("should save multiple SDK dependencies when kit declares both functions and admin", async () => {
      mockFs({
        "/abs/path/package-lock.json": {
          packages: {
            "node_modules/@firebase-function-kits/my-kit": {
              peerDependencies: {
                "firebase-admin": "^14.0.0",
                "firebase-functions": "^7.0.0",
              },
            },
            "node_modules/firebase-admin": { version: "14.3.0" },
            "node_modules/firebase-functions": { version: "7.3.2" },
          },
        },
      });

      await buildAndInstallKit("/abs/path", "@firebase-function-kits/my-kit", false);

      expect(wrapSpawnStub).to.have.been.calledThrice;
      expect(wrapSpawnStub.firstCall).to.have.been.calledWith(
        "npm",
        ["install", "@firebase-function-kits/my-kit", "--save-prefix=^"],
        "/abs/path",
      );
      expect(wrapSpawnStub.secondCall).to.have.been.calledWith(
        "npm",
        ["install", "firebase-functions@^7.3.2", "firebase-admin@^14.3.0", "--save-prefix=^"],
        "/abs/path",
      );
      expect(wrapSpawnStub.thirdCall).to.have.been.calledWith("npm", ["run", "build"], "/abs/path");
    });

    it("should throw FirebaseError if npm install fails", async () => {
      wrapSpawnStub.onFirstCall().rejects(new Error("npm install error"));

      await expect(buildAndInstallKit("/abs/path", "my-kit", false)).to.be.rejectedWith(
        FirebaseError,
        /NPM install failed: npm install error/,
      );
    });

    it("should throw FirebaseError if saving SDK dependencies fails", async () => {
      const origError = new Error("ERESOLVE peer dependency conflict");
      wrapSpawnStub
        .withArgs("npm", ["install", "firebase-functions@^7.3.2", "--save-prefix=^"], "/abs/path")
        .rejects(origError);

      let err: unknown;
      try {
        await buildAndInstallKit("/abs/path", "my-kit", false);
      } catch (e: unknown) {
        err = e;
      }
      expect(err).to.be.an.instanceOf(FirebaseError);
      expect((err as FirebaseError).message).to.match(
        /Failed to install required SDK dependencies/,
      );
      expect((err as FirebaseError).original).to.equal(origError);
    });

    it("should throw FirebaseError if typescript build fails", async () => {
      wrapSpawnStub
        .withArgs("npm", ["run", "build"], "/abs/path")
        .rejects(new Error("tsc build error"));

      await expect(buildAndInstallKit("/abs/path", "my-kit", false)).to.be.rejectedWith(
        FirebaseError,
        /TypeScript build failed: tsc build error/,
      );
    });
  });

  describe("getKitPackagesToSave", () => {
    it("should resolve installed versions from package-lock.json when hoisted", async () => {
      mockFs({
        "/mock/src/package-lock.json": {
          packages: {
            "node_modules/@scope/my-kit": {
              peerDependencies: {
                "firebase-admin": "^14.0.0",
                "firebase-functions": "^7.0.0",
              },
            },
            "node_modules/firebase-admin": { version: "14.3.0" },
            "node_modules/firebase-functions": { version: "7.3.2" },
          },
        },
      });

      const packagesToSave = await getKitPackagesToSave("/mock/src", "@scope/my-kit");

      expect(packagesToSave).to.deep.equal(["firebase-functions@^7.3.2", "firebase-admin@^14.3.0"]);
    });

    it("should resolve declared versions from package-lock.json when packages are not hoisted", async () => {
      mockFs({
        "/mock/src/package-lock.json": {
          packages: {
            "node_modules/@scope/my-kit": {
              peerDependencies: {
                "firebase-admin": "^14.2.0",
                "firebase-functions": "^7.1.0",
              },
            },
          },
        },
      });

      const packagesToSave = await getKitPackagesToSave("/mock/src", "@scope/my-kit");

      expect(packagesToSave).to.deep.equal(["firebase-functions@^7.1.0", "firebase-admin@^14.2.0"]);
    });

    it("should omit firebase-admin when not declared, even if firebase-admin is present in package-lock.json", async () => {
      mockFs({
        "/mock/src/package-lock.json": {
          packages: {
            "node_modules/@scope/my-kit": {
              dependencies: {
                "firebase-functions": "^7.2.0",
              },
            },
            "node_modules/firebase-admin": { version: "14.3.0" },
            "node_modules/firebase-functions": { version: "7.2.0" },
          },
        },
      });

      const packagesToSave = await getKitPackagesToSave("/mock/src", "@scope/my-kit");

      expect(packagesToSave).to.deep.equal(["firebase-functions@^7.2.0"]);
    });

    it("should throw FirebaseError when functions is undeclared", async () => {
      mockFs({
        "/mock/src/package-lock.json": {
          packages: {
            "node_modules/@scope/my-kit": {
              dependencies: {},
            },
          },
        },
      });

      await expect(getKitPackagesToSave("/mock/src", "@scope/my-kit")).to.be.rejectedWith(
        FirebaseError,
        /Package '@scope\/my-kit' is not a valid Function Kit: it must declare 'firebase-functions'/,
      );
    });

    it("should fall back to reading node_modules package.json when lockfile is missing", async () => {
      mockFs({
        "/mock/src/node_modules/@scope/my-kit/package.json": {
          peerDependencies: {
            "firebase-admin": "^14.1.0",
            "firebase-functions": "^7.3.2",
          },
        },
      });

      const packagesToSave = await getKitPackagesToSave("/mock/src", "@scope/my-kit");

      expect(packagesToSave).to.deep.equal(["firebase-functions@^7.3.2", "firebase-admin@^14.1.0"]);
    });

    it("should preserve range and >= syntax when falling back to node_modules package.json", async () => {
      mockFs({
        "/mock/src/node_modules/@scope/my-kit/package.json": {
          peerDependencies: {
            "firebase-admin": ">=13.0.0 <15.0.0",
            "firebase-functions": ">=7.0.0",
          },
        },
      });

      const packagesToSave = await getKitPackagesToSave("/mock/src", "@scope/my-kit");

      expect(packagesToSave).to.deep.equal([
        "firebase-functions@>=7.0.0",
        "firebase-admin@>=13.0.0 <15.0.0",
      ]);
    });

    it("should fall back gracefully to node_modules when lockfile contains invalid JSON", async () => {
      mockFs({
        "/mock/src/package-lock.json": new Error("Invalid JSON"),
        "/mock/src/node_modules/@scope/my-kit/package.json": {
          dependencies: {
            "firebase-functions": "^7.0.0",
          },
        },
      });

      const packagesToSave = await getKitPackagesToSave("/mock/src", "@scope/my-kit");

      expect(packagesToSave).to.deep.equal(["firebase-functions@^7.0.0"]);
    });

    it("should fall back gracefully to node_modules when lockfile contains null", async () => {
      mockFs({
        "/mock/src/package-lock.json": null,
        "/mock/src/node_modules/@scope/my-kit/package.json": {
          dependencies: {
            "firebase-functions": "^7.0.0",
          },
        },
      });

      const packagesToSave = await getKitPackagesToSave("/mock/src", "@scope/my-kit");

      expect(packagesToSave).to.deep.equal(["firebase-functions@^7.0.0"]);
    });

    it("should throw FirebaseError instead of TypeError when both lockfile and kit package.json contain null", async () => {
      mockFs({
        "/mock/src/package-lock.json": null,
        "/mock/src/node_modules/@scope/my-kit/package.json": null,
      });

      await expect(getKitPackagesToSave("/mock/src", "@scope/my-kit")).to.be.rejectedWith(
        FirebaseError,
        /Package '@scope\/my-kit' is not a valid Function Kit: it must declare 'firebase-functions'/,
      );
    });

    it("should preserve exact pins when declared in package-lock.json", async () => {
      mockFs({
        "/mock/src/package-lock.json": {
          packages: {
            "node_modules/@scope/my-kit": {
              peerDependencies: {
                "firebase-functions": "7.1.0",
              },
            },
            "node_modules/firebase-functions": { version: "7.1.0" },
          },
        },
      });

      const packagesToSave = await getKitPackagesToSave("/mock/src", "@scope/my-kit");

      expect(packagesToSave).to.deep.equal(["firebase-functions@=7.1.0"]);
    });

    it("should preserve tilde ranges when declared in package-lock.json", async () => {
      mockFs({
        "/mock/src/package-lock.json": {
          packages: {
            "node_modules/@scope/my-kit": {
              peerDependencies: {
                "firebase-functions": "~7.1.0",
              },
            },
            "node_modules/firebase-functions": { version: "7.1.3" },
          },
        },
      });

      const packagesToSave = await getKitPackagesToSave("/mock/src", "@scope/my-kit");

      expect(packagesToSave).to.deep.equal(["firebase-functions@~7.1.3"]);
    });
  });

  describe("createNpmPackageAdapter", () => {
    it("should reject invalid template when creating adapter", () => {
      expect(() =>
        createNpmPackageAdapter({
          config: { projectDir: "/mock/project" } as Config,
          package: "my-pkg",
          template: "invalid" as TemplateType,
        }),
      ).to.throw(FirebaseError, /Invalid template 'invalid'/);
    });

    it("should find existing kit by package name", () => {
      const existingKits: ValidatedKitSingle[] = [
        {
          kit: "pkg-kit",
          sourcePackage: { name: "@scope/my-pkg" },
          source: "function-kits/pkg-kit/source",
          instances: { inst1: "function-kits/pkg-kit/config-inst1" },
        },
      ];
      const adapter = createNpmPackageAdapter({
        config: { projectDir: "/mock/project" } as Config,
        package: "@scope/my-pkg@1.0.0",
      });

      expect(adapter.defaultKitId).to.equal("my-pkg");
      expect(adapter.findExistingKit(existingKits)).to.equal(existingKits[0]);
    });

    it("should pass --ignore-scripts for third-party packages in prepareSource without calling validateAndConfirm first", async () => {
      mockFs({
        "/mock/project/function-kits/my-pkg/source/package-lock.json": {
          packages: {
            "node_modules/@third-party/my-pkg": {
              peerDependencies: { "firebase-functions": "^7.0.0" },
            },
            "node_modules/firebase-functions": { version: "7.3.2" },
          },
        },
      });
      const mockConfig = {
        projectDir: "/mock/project",
        src: {},
        path: (rel: string) => path.join("/mock/project", rel),
        askWriteProjectFile: () => Promise.resolve(),
      } as unknown as Config;

      const adapter = createNpmPackageAdapter({
        config: mockConfig,
        package: "@third-party/my-pkg@1.0.0",
      });

      const createdPaths: string[] = [];
      const prepared = await adapter.prepareSource("my-pkg", createdPaths);

      expect(createdPaths).to.deep.equal(["/mock/project/function-kits/my-pkg"]);
      expect(prepared).to.deep.equal({
        sourcePath: "function-kits/my-pkg/source",
        sourcePackage: { name: "@third-party/my-pkg" },
        predeploy: ['npm --prefix "$RESOURCE_DIR" run build'],
      });
      expect(wrapSpawnStub.firstCall).to.have.been.calledWith(
        "npm",
        ["install", "@third-party/my-pkg@1.0.0", "--save-prefix=^", "--ignore-scripts"],
        "/mock/project/function-kits/my-pkg/source",
      );
    });
  });
});
