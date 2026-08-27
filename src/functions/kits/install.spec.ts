import { expect } from "chai";
import * as sinon from "sinon";
import * as path from "path";
import * as fs from "fs-extra";
import * as clc from "colorette";

import {
  generateUniqueId,
  parseNpmPackageSpecifier,
  validateNpmPackageName,
  sanitizePackageNameToKitName,
  isThirdPartyPackage,
  checkPackageHasShrinkwrap,
  isKitConfiguredForProject,
  extractExistingFunctionsInfo,
  addKitToConfig,
  findKitConfig,
  addInstanceToKitConfig,
  scaffoldKit,
  addInstanceToKit,
  promptKitInstanceId,
  promptKitId,
  promptSecurityConfirmation,
  promptExistingInstanceForProject,
  buildAndInstallKit,
  buildAndInstallDirectoryKit,
  validateAndResolveDirectoryKit,
  findExistingKit,
  resolvePackageSource,
  resolveDirectorySource,
  printKitFirstDeployReport,
  addKitInstanceOrConfigureProject,
  installKitOrInstance,
  TemplateType,
} from "./install";
import * as env from "./env";
import * as functionsEnv from "../env";
import * as build from "../../deploy/functions/build";
import * as runtimes from "../../deploy/functions/runtimes";
import * as iam from "../../gcp/iam";
import * as initSpawn from "../../init/spawn";
import * as prompt from "../../prompt";
import { Config } from "../../config";
import { FirebaseError } from "../../error";
import { KitFunctionConfig } from "../../firebaseConfig";
import { ValidatedKitSingle } from "../projectConfig";
import { logger } from "../../logger";
import * as experiments from "../../experiments";

describe("functions/kits/install", () => {
  let wrapSpawnStub: sinon.SinonStub;
  let spawnWithOutputStub: sinon.SinonStub;
  let seedKitInstanceEnvStub: sinon.SinonStub;
  let loggerInfoStub: sinon.SinonStub;
  let loggerWarnStub: sinon.SinonStub;
  let statStub: sinon.SinonStub;

  beforeEach(() => {
    sinon.stub(experiments, "assertEnabled");
    sinon.stub(experiments, "isEnabled").withArgs("kits").returns(true);
    wrapSpawnStub = sinon.stub(initSpawn, "wrapSpawn").resolves();
    spawnWithOutputStub = sinon
      .stub(initSpawn, "spawnWithOutput")
      .resolves(JSON.stringify([{ hasShrinkwrap: true }]));
    sinon.stub(fs, "ensureDir").resolves();
    sinon.stub(fs, "pathExists").resolves(false);
    statStub = sinon.stub(fs, "stat").resolves({ isDirectory: () => true } as fs.Stats);
    sinon.stub(fs, "readJson").resolves({});
    sinon.stub(fs, "writeJson").resolves();
    sinon.stub(fs, "writeFile").resolves();
    seedKitInstanceEnvStub = sinon.stub(env, "seedKitInstanceEnv");
    loggerInfoStub = sinon.stub(logger, "info");
    loggerWarnStub = sinon.stub(logger, "warn");
  });

  afterEach(() => {
    sinon.restore();
  });

  describe("validateNpmPackageName", () => {
    it("should accept valid unscoped package names", () => {
      expect(() => validateNpmPackageName("my-kit")).to.not.throw();
      expect(() => validateNpmPackageName("firestore-export")).to.not.throw();
      expect(() => validateNpmPackageName("kit_123.v1")).to.not.throw();
    });

    it("should accept valid scoped package names with exactly one slash", () => {
      expect(() =>
        validateNpmPackageName("@firebase-function-kits/firestore-bigquery-export"),
      ).to.not.throw();
      expect(() => validateNpmPackageName("@invertase/example-kit")).to.not.throw();
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
      expect(() => validateNpmPackageName("a".repeat(215))).to.throw(
        FirebaseError,
        /Invalid NPM package name/,
      );
    });
  });

  describe("generateUniqueId", () => {
    it("should return base ID when it is not in existing IDs", () => {
      const existing = new Set(["other-kit"]);
      expect(generateUniqueId("my-kit", existing)).to.equal("my-kit");
    });

    it("should append random 4-character hex suffix when base ID collides", () => {
      const existing = new Set(["my-kit"]);
      const res = generateUniqueId("my-kit", existing);
      expect(res).to.match(/^my-kit-[a-f0-9]{4}$/);
      expect(existing.has(res)).to.be.false;
    });

    it("should truncate long base IDs to ensure total length <= 40", () => {
      const longBase = "a".repeat(40);
      const existing = new Set([longBase]);
      const res = generateUniqueId(longBase, existing);
      expect(res.length).to.be.at.most(40);
      expect(res).to.match(/^a{35}-[a-f0-9]{4}$/);
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

  describe("sanitizePackageNameToKitName", () => {
    it("should extract kit name from scoped package name", () => {
      expect(
        sanitizePackageNameToKitName("@firebase-function-kits/firestore-bigquery-export"),
      ).to.equal("firestore-bigquery-export");
      expect(sanitizePackageNameToKitName("@foo/bar")).to.equal("bar");
    });

    it("should sanitize non-scoped package name", () => {
      expect(sanitizePackageNameToKitName("my-kit")).to.equal("my-kit");
      expect(sanitizePackageNameToKitName("My_Kit!")).to.equal("my_kit");
    });

    it("should truncate long names to 40 characters", () => {
      const longName = "@scope/" + "a".repeat(50);
      expect(sanitizePackageNameToKitName(longName)).to.equal("a".repeat(40));
    });
  });

  describe("isThirdPartyPackage", () => {
    it("should return false for packages under @firebase-function-kits scope", () => {
      expect(isThirdPartyPackage("@firebase-function-kits/firestore-bigquery-export")).to.be.false;
    });

    it("should return true for packages outside @firebase-function-kits scope", () => {
      expect(isThirdPartyPackage("firebase-functions-kits")).to.be.true;
      expect(isThirdPartyPackage("@firebase-function-kits-fake/foo")).to.be.true;
      expect(isThirdPartyPackage("@other-scope/my-kit")).to.be.true;
      expect(isThirdPartyPackage("third-party-kit")).to.be.true;
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

  describe("isKitConfiguredForProject", () => {
    let hasProjectEnvStub: sinon.SinonStub;

    beforeEach(() => {
      hasProjectEnvStub = sinon.stub(functionsEnv, "hasProjectEnv");
    });

    it("should return false when no instance has project env", () => {
      const mockConfig = { path: (p: string) => `/mock/${p}` };
      const kit = {
        kit: "test-kit",
        source: "function-kits/test-kit",
        instances: { inst: "function-kits/test-kit/config-inst" },
      } as unknown as ValidatedKitSingle;
      hasProjectEnvStub.returns(false);

      expect(isKitConfiguredForProject(mockConfig, kit, "my-target-proj")).to.be.false;
      expect(hasProjectEnvStub).to.have.been.calledWith(
        "/mock/function-kits/test-kit/config-inst",
        "my-target-proj",
        undefined,
      );
    });

    it("should return true when any instance has project env", () => {
      const mockConfig = { path: (p: string) => `/mock/${p}` };
      const kit = {
        kit: "test-kit",
        source: "function-kits/test-kit",
        instances: {
          inst1: "function-kits/test-kit/config-inst1",
          inst2: "function-kits/test-kit/config-inst2",
        },
      } as unknown as ValidatedKitSingle;
      hasProjectEnvStub
        .withArgs("/mock/function-kits/test-kit/config-inst1", "my-target-proj", "staging")
        .returns(false);
      hasProjectEnvStub
        .withArgs("/mock/function-kits/test-kit/config-inst2", "my-target-proj", "staging")
        .returns(true);

      expect(isKitConfiguredForProject(mockConfig, kit, "my-target-proj", "staging")).to.be.true;
    });
  });

  describe("extractExistingFunctionsInfo", () => {
    it("should return empty sets when configFunctions is undefined or empty", () => {
      const resUndefined = extractExistingFunctionsInfo(undefined);
      expect(resUndefined.existingFunctions).to.deep.equal([]);
      expect(resUndefined.existingKitIds.size).to.equal(0);
      expect(resUndefined.existingCodebases.size).to.equal(0);
      expect(resUndefined.existingInstanceIds.size).to.equal(0);

      const resEmpty = extractExistingFunctionsInfo([]);
      expect(resEmpty.existingFunctions).to.deep.equal([]);
      expect(resEmpty.existingKitIds.size).to.equal(0);
      expect(resEmpty.existingCodebases.size).to.equal(0);
      expect(resEmpty.existingInstanceIds.size).to.equal(0);
    });

    it("should extract kit IDs, instance IDs, and codebases correctly", () => {
      const functionsConfig = [
        {
          codebase: "my-codebase",
          source: "functions",
        },
        {
          kit: "my-kit",
          source: "function-kits/my-kit",
          instances: {
            "inst-1": "function-kits/my-kit/config-inst-1",
            "inst-2": "function-kits/my-kit/config-inst-2",
          },
        },
      ];

      const res = extractExistingFunctionsInfo(functionsConfig);
      expect(res.existingCodebases.has("my-codebase")).to.be.true;
      expect(res.existingKitIds.has("my-kit")).to.be.true;
      expect(res.existingInstanceIds.has("inst-1")).to.be.true;
      expect(res.existingInstanceIds.has("inst-2")).to.be.true;
    });
  });

  describe("addKitToConfig", () => {
    it("should add kit to empty config functions", () => {
      const writtenFiles: Record<string, unknown> = {};
      const mockConfig = {
        src: {},
        writeProjectFile: (file: string, content: unknown) => {
          writtenFiles[file] = content;
        },
      } as unknown as Config;

      addKitToConfig(mockConfig, {
        kitId: "new-kit",
        instanceId: "new-instance",
        packageName: "@scope/pkg",
        sourcePath: "function-kits/new-kit/source",
        configDirPath: "function-kits/new-kit/config-new-instance",
      });

      expect(writtenFiles["firebase.json"]).to.deep.equal({
        functions: [
          {
            kit: "new-kit",
            sourcePackage: { name: "@scope/pkg" },
            source: "function-kits/new-kit/source",
            instances: {
              "new-instance": "function-kits/new-kit/config-new-instance",
            },
            predeploy: ['npm --prefix "$RESOURCE_DIR" run build'],
          },
        ],
      });
    });

    it("should append kit when functions is already an array", () => {
      const writtenFiles: Record<string, unknown> = {};
      const existingEntry = {
        codebase: "default",
        source: "functions",
      };
      const mockConfig = {
        src: {
          functions: [existingEntry],
        },
        writeProjectFile: (file: string, content: unknown) => {
          writtenFiles[file] = content;
        },
      } as unknown as Config;

      addKitToConfig(mockConfig, {
        kitId: "new-kit",
        instanceId: "new-instance",
        packageName: "@scope/pkg",
        sourcePath: "function-kits/new-kit/source",
        configDirPath: "function-kits/new-kit/config-new-instance",
      });

      const functions = (writtenFiles["firebase.json"] as { functions: unknown[] }).functions;
      expect(functions).to.have.length(2);
      expect(functions[0]).to.deep.equal(existingEntry);
      expect(functions[1]).to.deep.equal({
        kit: "new-kit",
        sourcePackage: { name: "@scope/pkg" },
        source: "function-kits/new-kit/source",
        instances: {
          "new-instance": "function-kits/new-kit/config-new-instance",
        },
        predeploy: ['npm --prefix "$RESOURCE_DIR" run build'],
      });
    });

    it("should convert single object functions config to array and append", () => {
      const writtenFiles: Record<string, unknown> = {};
      const existingEntry = {
        source: "functions",
      };
      const mockConfig = {
        src: {
          functions: existingEntry,
        },
        writeProjectFile: (file: string, content: unknown) => {
          writtenFiles[file] = content;
        },
      } as unknown as Config;

      addKitToConfig(mockConfig, {
        kitId: "new-kit",
        instanceId: "new-instance",
        packageName: "@scope/pkg",
        sourcePath: "function-kits/new-kit/source",
        configDirPath: "function-kits/new-kit/config-new-instance",
      });

      const functions = (writtenFiles["firebase.json"] as { functions: unknown[] }).functions;
      expect(functions).to.have.length(2);
      expect(functions[0]).to.deep.equal(existingEntry);
    });

    it("should add directory kit without sourcePackage and with predeploy when hasBuildScript is true", () => {
      const writtenFiles: Record<string, unknown> = {};
      const mockConfig = {
        src: {},
        writeProjectFile: (file: string, content: unknown) => {
          writtenFiles[file] = content;
        },
      } as unknown as Config;

      addKitToConfig(mockConfig, {
        kitId: "local-kit",
        instanceId: "inst1",
        packageName: undefined,
        sourcePath: "my-local-functions",
        configDirPath: "function-kits/local-kit/config-inst1",
        hasBuildScript: true,
      });

      expect(writtenFiles["firebase.json"]).to.deep.equal({
        functions: [
          {
            kit: "local-kit",
            source: "my-local-functions",
            instances: {
              inst1: "function-kits/local-kit/config-inst1",
            },
            predeploy: ['npm --prefix "$RESOURCE_DIR" run build'],
          },
        ],
      });
    });

    it("should add directory kit without predeploy when hasBuildScript is false", () => {
      const writtenFiles: Record<string, unknown> = {};
      const mockConfig = {
        src: {},
        writeProjectFile: (file: string, content: unknown) => {
          writtenFiles[file] = content;
        },
      } as unknown as Config;

      addKitToConfig(mockConfig, {
        kitId: "local-kit",
        instanceId: "inst1",
        packageName: undefined,
        sourcePath: "my-local-functions",
        configDirPath: "function-kits/local-kit/config-inst1",
        hasBuildScript: false,
      });

      expect(writtenFiles["firebase.json"]).to.deep.equal({
        functions: [
          {
            kit: "local-kit",
            source: "my-local-functions",
            instances: {
              inst1: "function-kits/local-kit/config-inst1",
            },
          },
        ],
      });
    });
  });

  describe("validateAndResolveDirectoryKit", () => {
    it("should throw if directory is outside of project directory", async () => {
      await expect(
        validateAndResolveDirectoryKit("/mock/project", "../outside-project"),
      ).to.be.rejectedWith(
        FirebaseError,
        "Directory '../outside-project' is outside of project directory. Function kit directory must be inside the project directory.",
      );

      await expect(
        validateAndResolveDirectoryKit("/mock/project", "/other/path/outside"),
      ).to.be.rejectedWith(
        FirebaseError,
        "Directory '/other/path/outside' is outside of project directory. Function kit directory must be inside the project directory.",
      );
    });

    it("should throw if directory does not exist", async () => {
      (fs.pathExists as sinon.SinonStub).withArgs("/mock/project/nonexistent").resolves(false);

      await expect(
        validateAndResolveDirectoryKit("/mock/project", "nonexistent"),
      ).to.be.rejectedWith(FirebaseError, "Directory 'nonexistent' does not exist.");
    });

    it("should throw if path is not a directory", async () => {
      (fs.pathExists as sinon.SinonStub).withArgs("/mock/project/file.txt").resolves(true);
      statStub
        .withArgs("/mock/project/file.txt")
        .resolves({ isDirectory: () => false } as fs.Stats);

      await expect(validateAndResolveDirectoryKit("/mock/project", "file.txt")).to.be.rejectedWith(
        FirebaseError,
        "Directory 'file.txt' is not a directory.",
      );
    });

    it("should throw if directory does not contain a package.json", async () => {
      (fs.pathExists as sinon.SinonStub).withArgs("/mock/project/my-kit").resolves(true);
      (fs.pathExists as sinon.SinonStub)
        .withArgs(path.join("/mock/project/my-kit", "package.json"))
        .resolves(false);

      await expect(validateAndResolveDirectoryKit("/mock/project", "my-kit")).to.be.rejectedWith(
        FirebaseError,
        "Directory 'my-kit' must contain a package.json file to be installed as a function kit.",
      );
    });

    it("should throw if package.json cannot be parsed", async () => {
      (fs.pathExists as sinon.SinonStub).withArgs("/mock/project/my-kit").resolves(true);
      (fs.pathExists as sinon.SinonStub)
        .withArgs(path.join("/mock/project/my-kit", "package.json"))
        .resolves(true);
      (fs.readJson as sinon.SinonStub)
        .withArgs(path.join("/mock/project/my-kit", "package.json"))
        .rejects(new Error("Unexpected token"));

      await expect(validateAndResolveDirectoryKit("/mock/project", "my-kit")).to.be.rejectedWith(
        FirebaseError,
        /Failed to parse package\.json in 'my-kit': Unexpected token/,
      );
    });

    it("should return ValidatedDirectoryKit with hasBuildScript: true when build script exists", async () => {
      (fs.pathExists as sinon.SinonStub).withArgs("/mock/project/my-kit").resolves(true);
      (fs.pathExists as sinon.SinonStub)
        .withArgs(path.join("/mock/project/my-kit", "package.json"))
        .resolves(true);
      (fs.readJson as sinon.SinonStub)
        .withArgs(path.join("/mock/project/my-kit", "package.json"))
        .resolves({
          scripts: {
            build: "tsc",
          },
        });

      const res = await validateAndResolveDirectoryKit("/mock/project", "my-kit");
      expect(res).to.deep.equal({
        absDirectoryPath: "/mock/project/my-kit",
        relSourcePath: "my-kit",
        hasBuildScript: true,
      });
    });

    it("should return ValidatedDirectoryKit with hasBuildScript: false when build script is absent", async () => {
      (fs.pathExists as sinon.SinonStub).withArgs("/mock/project/my-kit").resolves(true);
      (fs.pathExists as sinon.SinonStub)
        .withArgs(path.join("/mock/project/my-kit", "package.json"))
        .resolves(true);
      (fs.readJson as sinon.SinonStub)
        .withArgs(path.join("/mock/project/my-kit", "package.json"))
        .resolves({
          scripts: {
            start: "node index.js",
          },
        });

      const res = await validateAndResolveDirectoryKit("/mock/project", "my-kit");
      expect(res).to.deep.equal({
        absDirectoryPath: "/mock/project/my-kit",
        relSourcePath: "my-kit",
        hasBuildScript: false,
      });
    });

    it("should handle current directory relative path", async () => {
      (fs.pathExists as sinon.SinonStub).withArgs("/mock/project").resolves(true);
      (fs.pathExists as sinon.SinonStub)
        .withArgs(path.join("/mock/project", "package.json"))
        .resolves(true);
      (fs.readJson as sinon.SinonStub)
        .withArgs(path.join("/mock/project", "package.json"))
        .resolves({});

      const res = await validateAndResolveDirectoryKit("/mock/project", ".");
      expect(res).to.deep.equal({
        absDirectoryPath: "/mock/project",
        relSourcePath: ".",
        hasBuildScript: false,
      });
    });
  });

  describe("buildAndInstallDirectoryKit", () => {
    it("should run npm install and npm run build when hasBuildScript is true", async () => {
      await buildAndInstallDirectoryKit("/mock/project/my-kit", true);

      expect(wrapSpawnStub).to.have.been.calledTwice;
      expect(wrapSpawnStub.firstCall).to.have.been.calledWith(
        "npm",
        ["install"],
        "/mock/project/my-kit",
      );
      expect(wrapSpawnStub.secondCall).to.have.been.calledWith(
        "npm",
        ["run", "build"],
        "/mock/project/my-kit",
      );
    });

    it("should run only npm install when hasBuildScript is false", async () => {
      await buildAndInstallDirectoryKit("/mock/project/my-kit", false);

      expect(wrapSpawnStub).to.have.been.calledOnce;
      expect(wrapSpawnStub.firstCall).to.have.been.calledWith(
        "npm",
        ["install"],
        "/mock/project/my-kit",
      );
    });

    it("should throw FirebaseError if npm install fails", async () => {
      wrapSpawnStub.withArgs("npm", ["install"]).rejects(new Error("npm install error"));

      await expect(buildAndInstallDirectoryKit("/mock/project/my-kit", true)).to.be.rejectedWith(
        FirebaseError,
        /NPM install failed: npm install error/,
      );
    });

    it("should throw FirebaseError if typescript build fails", async () => {
      wrapSpawnStub.withArgs("npm", ["run", "build"]).rejects(new Error("tsc error"));

      await expect(buildAndInstallDirectoryKit("/mock/project/my-kit", true)).to.be.rejectedWith(
        FirebaseError,
        /TypeScript build failed: tsc error/,
      );
    });
  });

  describe("findExistingKit", () => {
    const mockFunctions: ValidatedKitSingle[] = [
      {
        kit: "pkg-kit",
        sourcePackage: { name: "@scope/my-pkg" },
        source: "function-kits/pkg-kit/source",
        instances: { inst1: "function-kits/pkg-kit/config-inst1" },
      },
      {
        kit: "dir-kit",
        source: "my-local-kit",
        instances: { inst1: "function-kits/dir-kit/config-inst1" },
      },
    ];
    const mockConfig = { projectDir: "/mock/project" } as Config;

    it("should find existing kit by package name", () => {
      const found = findExistingKit(mockFunctions, {
        package: "@scope/my-pkg@1.0.0",
        config: mockConfig,
      });
      expect(found).to.equal(mockFunctions[0]);
    });

    it("should find existing kit by local directory path", () => {
      const found = findExistingKit(mockFunctions, {
        directory: "my-local-kit",
        config: mockConfig,
      });
      expect(found).to.equal(mockFunctions[1]);
    });

    it("should return undefined if kit is not found", () => {
      const found = findExistingKit(mockFunctions, {
        package: "other-pkg",
        config: mockConfig,
      });
      expect(found).to.be.undefined;
    });
  });

  describe("resolvePackageSource", () => {
    it("should reject invalid template", async () => {
      await expect(
        resolvePackageSource({
          config: { projectDir: "/mock/project" } as Config,
          package: "my-pkg",
          template: "invalid" as TemplateType,
        }),
      ).to.be.rejectedWith(FirebaseError, /Invalid template 'invalid'/);
    });

    it("should resolve valid package source", async () => {
      wrapSpawnStub
        .withArgs("npm", ["pack", "@firebase-function-kits/firestore-export", "--json"])
        .resolves(
          JSON.stringify([
            {
              name: "@firebase-function-kits/firestore-export",
              hasShrinkwrap: true,
            },
          ]),
        );

      const source = await resolvePackageSource({
        config: { projectDir: "/mock/project" } as Config,
        package: "@firebase-function-kits/firestore-export",
        template: "installation",
        nonInteractive: true,
      });

      expect(source.defaultKitName).to.equal("@firebase-function-kits/firestore-export");
      expect(source.sourcePackageName).to.equal("@firebase-function-kits/firestore-export");
      expect(source.hasBuildScript).to.be.true;
    });
  });

  describe("resolveDirectorySource", () => {
    it("should throw if directory option is missing", async () => {
      await expect(
        resolveDirectorySource({
          config: { projectDir: "/mock/project" } as Config,
        }),
      ).to.be.rejectedWith(FirebaseError, "Must specify --directory.");
    });

    it("should resolve valid directory source", async () => {
      (fs.pathExists as sinon.SinonStub).withArgs("/mock/project/my-kit").resolves(true);
      (fs.pathExists as sinon.SinonStub)
        .withArgs(path.join("/mock/project/my-kit", "package.json"))
        .resolves(true);
      (fs.readJson as sinon.SinonStub)
        .withArgs(path.join("/mock/project/my-kit", "package.json"))
        .resolves({ scripts: { build: "tsc" } });

      const source = await resolveDirectorySource({
        config: {
          projectDir: "/mock/project",
          path: (p: string) => path.join("/mock/project", p),
        } as Config,
        directory: "my-kit",
      });

      expect(source.defaultKitName).to.equal("my-kit");
      expect(source.sourcePackageName).to.be.undefined;
      expect(source.hasBuildScript).to.be.true;
    });
  });

  describe("findKitConfig", () => {
    it("should find kit config when functions is an array", () => {
      const mockConfig = {
        src: {
          functions: [
            { codebase: "default", source: "functions" },
            {
              kit: "my-kit",
              source: "function-kits/my-kit/source",
              instances: {},
            },
          ],
        },
      } as unknown as Config;

      const found = findKitConfig(mockConfig, "my-kit");
      expect(found).to.deep.equal({
        kit: "my-kit",
        source: "function-kits/my-kit/source",
        instances: {},
      });
    });

    it("should find kit config when functions is a single object", () => {
      const mockConfig = {
        src: {
          functions: {
            kit: "single-kit",
            source: "function-kits/single-kit/source",
            instances: {},
          },
        },
      } as unknown as Config;

      const found = findKitConfig(mockConfig, "single-kit");
      expect(found).to.deep.equal({
        kit: "single-kit",
        source: "function-kits/single-kit/source",
        instances: {},
      });
    });

    it("should return undefined if kit is not found", () => {
      const mockConfig = {
        src: {
          functions: [],
        },
      } as unknown as Config;

      expect(findKitConfig(mockConfig, "nonexistent-kit")).to.be.undefined;
    });
  });

  describe("addInstanceToKitConfig", () => {
    it("should add instance to existing kit in config and save", () => {
      const writtenFiles: Record<string, unknown> = {};
      const originalEntryInConfig: KitFunctionConfig = {
        kit: "my-kit",
        sourcePackage: { name: "@scope/pkg" },
        source: "function-kits/my-kit/source",
        instances: {
          inst1: "function-kits/my-kit/config-inst1",
        },
      };
      const mockConfig = {
        src: {
          functions: [originalEntryInConfig],
        },
        writeProjectFile: (file: string, content: unknown) => {
          writtenFiles[file] = content;
        },
      } as unknown as Config;

      addInstanceToKitConfig(mockConfig, "my-kit", "inst2", "function-kits/my-kit/config-inst2");

      expect(originalEntryInConfig.instances).to.deep.equal({
        inst1: "function-kits/my-kit/config-inst1",
        inst2: "function-kits/my-kit/config-inst2",
      });
      expect(writtenFiles["firebase.json"]).to.deep.equal({
        functions: [originalEntryInConfig],
      });
    });

    it("should throw FirebaseError if kit is not found in config", () => {
      const mockConfig = {
        src: {
          functions: [],
        },
      } as unknown as Config;

      expect(() =>
        addInstanceToKitConfig(mockConfig, "missing-kit", "inst1", "config-inst1"),
      ).to.throw(FirebaseError, "Kit 'missing-kit' not found in firebase.json.");
    });
  });

  describe("scaffoldKit", () => {
    it("should scaffold files and add kit to config without seedEnv", async () => {
      const writtenFiles: Record<string, unknown> = {};
      const mockConfig = {
        projectDir: "/mock/project",
        src: {},
        path: (rel: string) => path.join("/mock/project", rel),
        askWriteProjectFile: sinon.stub().resolves(),
        writeProjectFile: (file: string, content: unknown) => {
          writtenFiles[file] = content;
        },
      } as unknown as Config;

      const paths = await scaffoldKit({
        config: mockConfig,
        kitId: "my-kit",
        instanceId: "inst1",
        packageName: "@scope/pkg",
      });

      expect(paths.sourcePath).to.equal("function-kits/my-kit/source");
      expect(paths.configDirPath).to.equal("function-kits/my-kit/config-inst1");
      expect(seedKitInstanceEnvStub).to.not.have.been.called;
      expect(writtenFiles["firebase.json"]).to.exist;
    });

    it("should scaffold files, seed .env.<project-id>, and add kit to config when seedEnv is provided", async () => {
      const writtenFiles: Record<string, unknown> = {};
      const mockConfig = {
        projectDir: "/mock/project",
        src: {},
        path: (rel: string) => path.join("/mock/project", rel),
        askWriteProjectFile: sinon.stub().resolves(),
        writeProjectFile: (file: string, content: unknown) => {
          writtenFiles[file] = content;
        },
      } as unknown as Config;

      await scaffoldKit({
        config: mockConfig,
        kitId: "my-kit",
        instanceId: "inst1",
        packageName: "@scope/pkg",
        seedEnv: {
          projectId: "my-project",
          projectAlias: "prod",
          envs: {
            API_KEY: "secret",
            MAX_INSTANCES: 10,
          },
        },
      });

      expect(seedKitInstanceEnvStub).to.have.been.calledOnceWith({
        configDir: path.join("/mock/project", "function-kits/my-kit/config-inst1"),
        functionsSource: path.join("/mock/project", "function-kits/my-kit/source"),
        projectDir: "/mock/project",
        projectId: "my-project",
        projectAlias: "prod",
        envs: {
          API_KEY: "secret",
          MAX_INSTANCES: 10,
        },
      });
      expect(writtenFiles["firebase.json"]).to.exist;
    });
  });

  describe("addInstanceToKit", () => {
    it("should ensure config dir and update config without seedEnv", async () => {
      const writtenFiles: Record<string, unknown> = {};
      const existingEntry: KitFunctionConfig = {
        kit: "my-kit",
        sourcePackage: { name: "@scope/pkg" },
        source: "function-kits/my-kit/source",
        instances: {
          inst1: "function-kits/my-kit/config-inst1",
        },
      };
      const mockConfig = {
        projectDir: "/mock/project",
        src: {
          functions: [existingEntry],
        },
        path: (rel: string) => path.join("/mock/project", rel),
        writeProjectFile: (file: string, content: unknown) => {
          writtenFiles[file] = content;
        },
      } as unknown as Config;

      const result = await addInstanceToKit({
        config: mockConfig,
        kitId: "my-kit",
        instanceId: "inst2",
      });

      expect(result.configDirPath).to.equal("function-kits/my-kit/config-inst2");
      expect(seedKitInstanceEnvStub).to.not.have.been.called;
      expect(existingEntry.instances["inst2"]).to.equal("function-kits/my-kit/config-inst2");
    });

    it("should ensure config dir, seed .env.<project-id>, and update config when seedEnv is provided", async () => {
      const writtenFiles: Record<string, unknown> = {};
      const existingEntry: KitFunctionConfig = {
        kit: "my-kit",
        sourcePackage: { name: "@scope/pkg" },
        source: "function-kits/my-kit/source",
        instances: {
          inst1: "function-kits/my-kit/config-inst1",
        },
      };
      const mockConfig = {
        projectDir: "/mock/project",
        src: {
          functions: [existingEntry],
        },
        path: (rel: string) => path.join("/mock/project", rel),
        writeProjectFile: (file: string, content: unknown) => {
          writtenFiles[file] = content;
        },
      } as unknown as Config;

      await addInstanceToKit({
        config: mockConfig,
        kitId: "my-kit",
        instanceId: "inst2",
        seedEnv: {
          projectId: "my-project",
          envs: {
            SETTING: "value",
          },
        },
      });

      expect(seedKitInstanceEnvStub).to.have.been.calledOnceWith({
        configDir: path.join("/mock/project", "function-kits/my-kit/config-inst2"),
        functionsSource: path.join("/mock/project", "function-kits/my-kit/source"),
        projectDir: "/mock/project",
        projectId: "my-project",
        projectAlias: undefined,
        envs: {
          SETTING: "value",
        },
      });
      expect(existingEntry.instances["inst2"]).to.equal("function-kits/my-kit/config-inst2");
    });

    it("should throw FirebaseError if kit does not exist in config", async () => {
      const mockConfig = {
        projectDir: "/mock/project",
        src: {
          functions: [],
        },
        path: (rel: string) => path.join("/mock/project", rel),
      } as unknown as Config;

      await expect(
        addInstanceToKit({
          config: mockConfig,
          kitId: "nonexistent-kit",
          instanceId: "inst1",
        }),
      ).to.be.rejectedWith(FirebaseError, "Kit 'nonexistent-kit' not found in firebase.json.");
    });
  });

  describe("promptKitInstanceId", () => {
    it("should return custom instance ID directly if provided and valid", async () => {
      const res = await promptKitInstanceId(
        "my-kit",
        new Set(["other-inst"]),
        new Set(["codebase1"]),
        false,
        "valid-custom-inst",
      );
      expect(res).to.equal("valid-custom-inst");
    });

    it("should throw if custom instance ID collides with existing instances", async () => {
      await expect(
        promptKitInstanceId(
          "my-kit",
          new Set(["existing-inst"]),
          new Set(),
          false,
          "existing-inst",
        ),
      ).to.be.rejectedWith(FirebaseError, /must be unique across all kits/);
    });

    it("should throw if custom instance ID collides with codebase name", async () => {
      await expect(
        promptKitInstanceId(
          "my-kit",
          new Set(),
          new Set(["existing-codebase"]),
          false,
          "existing-codebase",
        ),
      ).to.be.rejectedWith(FirebaseError, /must be mutually exclusive/);
    });

    it("should prompt user when custom instance ID is not provided", async () => {
      sinon.stub(prompt, "input").resolves("prompted-inst");
      const res = await promptKitInstanceId("my-kit", new Set(), new Set());
      expect(res).to.equal("prompted-inst");
    });
  });

  describe("promptKitId", () => {
    it("should return custom kit ID directly if provided and valid", async () => {
      const res = await promptKitId("my-pkg", new Set(["other-kit"]), false, "custom-kit-id");
      expect(res).to.equal("custom-kit-id");
    });

    it("should throw if custom kit ID collides with existing kit IDs", async () => {
      await expect(
        promptKitId("my-pkg", new Set(["existing-kit"]), false, "existing-kit"),
      ).to.be.rejectedWith(FirebaseError, /functions.kit must be unique/);
    });

    it("should prompt user when custom kit ID is not provided", async () => {
      sinon.stub(prompt, "input").resolves("prompted-kit");
      const res = await promptKitId("my-pkg", new Set());
      expect(res).to.equal("prompted-kit");
    });
  });

  describe("promptSecurityConfirmation", () => {
    it("should return false without prompting for 1P package with shrinkwrap", async () => {
      spawnWithOutputStub.resolves(JSON.stringify([{ hasShrinkwrap: true }]));
      const confirmStub = sinon.stub(prompt, "confirm");

      const res = await promptSecurityConfirmation(
        "@firebase-function-kits/my-kit",
        "@firebase-function-kits/my-kit",
      );

      expect(res).to.be.false;
      expect(confirmStub).to.not.have.been.called;
    });

    it("should prompt confirmation when a 1P kit lacks shrinkwrap", async () => {
      spawnWithOutputStub.resolves(JSON.stringify([{ files: [{ path: "package.json" }] }]));
      const confirmStub = sinon.stub(prompt, "confirm").resolves(true);

      const res = await promptSecurityConfirmation(
        "@firebase-function-kits/my-kit",
        "@firebase-function-kits/my-kit",
      );

      expect(res).to.be.false;
      expect(confirmStub).to.have.been.calledOnceWith({
        message:
          "Are you sure you want to install @firebase-function-kits/my-kit without locked dependencies?",
        default: false,
        nonInteractive: undefined,
      });
      expect(loggerWarnStub).to.have.been.calledWith(
        sinon.match(/functions:/),
        sinon.match(/does not have an npm-shrinkwrap\.json file/),
      );
    });

    it("should prompt confirmation when a 3P kit has shrinkwrap", async () => {
      spawnWithOutputStub.resolves(JSON.stringify([{ hasShrinkwrap: true }]));
      const confirmStub = sinon.stub(prompt, "confirm").resolves(true);

      const res = await promptSecurityConfirmation(
        "@third-party/custom-kit",
        "@third-party/custom-kit",
      );

      expect(res).to.be.true;
      expect(confirmStub).to.have.been.calledOnceWith({
        message: "Are you sure you want to install the third-party kit @third-party/custom-kit?",
        default: false,
        nonInteractive: undefined,
      });
      expect(loggerWarnStub).to.have.been.calledWith(
        sinon.match(/functions:/),
        sinon.match(/is a third-party kit/),
      );
    });

    it("should cancel installation if user declines confirmation", async () => {
      spawnWithOutputStub.resolves(JSON.stringify([{ files: [{ path: "package.json" }] }]));
      sinon.stub(prompt, "confirm").resolves(false);

      await expect(
        promptSecurityConfirmation(
          "@firebase-function-kits/my-kit",
          "@firebase-function-kits/my-kit",
        ),
      ).to.be.rejectedWith(FirebaseError, "Installation cancelled.");
    });
  });

  describe("promptExistingInstanceForProject", () => {
    it("should throw if kit has no instances configured", async () => {
      const kit = {
        kit: "my-kit",
        instances: {},
      } as unknown as ValidatedKitSingle;

      await expect(promptExistingInstanceForProject({}, kit)).to.be.rejectedWith(
        FirebaseError,
        /Kit 'my-kit' has no instances configured\./,
      );
    });

    it("should suggest deploy command directly when only one instance exists", async () => {
      const selectStub = sinon.stub(prompt, "select");
      const kit = {
        kit: "my-kit",
        instances: {
          "inst-1": "function-kits/my-kit/config-inst-1",
        },
      } as unknown as ValidatedKitSingle;

      const res = await promptExistingInstanceForProject({ project: "my-project" }, kit);

      expect(res).to.equal("inst-1");
      expect(selectStub).to.not.have.been.called;
      expect(loggerInfoStub).to.have.been.calledWith(
        sinon.match(/functions:/),
        sinon.match(/firebase deploy --only functions:inst-1 --project my-project/),
      );
    });

    it("should prompt to select instance when multiple instances exist", async () => {
      const selectStub = sinon.stub(prompt, "select").resolves("inst-2");
      const kit = {
        kit: "my-kit",
        instances: {
          "inst-1": "function-kits/my-kit/config-inst-1",
          "inst-2": "function-kits/my-kit/config-inst-2",
        },
      } as unknown as ValidatedKitSingle;

      const res = await promptExistingInstanceForProject(
        { project: "my-project", nonInteractive: false },
        kit,
      );

      expect(res).to.equal("inst-2");
      expect(selectStub).to.have.been.calledOnce;
      expect(loggerInfoStub).to.have.been.calledWith(
        sinon.match(/functions:/),
        sinon.match(/firebase deploy --only functions:inst-2 --project my-project/),
      );
    });
  });

  describe("buildAndInstallKit", () => {
    it("should run npm install and npm run build without --ignore-scripts for first-party kit", async () => {
      await buildAndInstallKit("/abs/path", "@firebase-function-kits/my-kit", false);

      expect(wrapSpawnStub).to.have.been.calledTwice;
      expect(wrapSpawnStub.firstCall).to.have.been.calledWith(
        "npm",
        ["install", "@firebase-function-kits/my-kit", "--save-prefix=^"],
        "/abs/path",
      );
      expect(wrapSpawnStub.secondCall).to.have.been.calledWith(
        "npm",
        ["run", "build"],
        "/abs/path",
      );
    });

    it("should run npm install with --ignore-scripts for third-party kit", async () => {
      await buildAndInstallKit("/abs/path", "third-party-kit", true);

      expect(wrapSpawnStub).to.have.been.calledTwice;
      expect(wrapSpawnStub.firstCall).to.have.been.calledWith(
        "npm",
        ["install", "third-party-kit", "--save-prefix=^", "--ignore-scripts"],
        "/abs/path",
      );
      expect(wrapSpawnStub.secondCall).to.have.been.calledWith(
        "npm",
        ["run", "build"],
        "/abs/path",
      );
    });

    it("should throw FirebaseError if npm install fails", async () => {
      wrapSpawnStub.onFirstCall().rejects(new Error("npm install error"));

      await expect(buildAndInstallKit("/abs/path", "my-kit", false)).to.be.rejectedWith(
        FirebaseError,
        /NPM install failed: npm install error/,
      );
    });

    it("should throw FirebaseError if typescript build fails", async () => {
      wrapSpawnStub.onFirstCall().resolves();
      wrapSpawnStub.onSecondCall().rejects(new Error("tsc build error"));

      await expect(buildAndInstallKit("/abs/path", "my-kit", false)).to.be.rejectedWith(
        FirebaseError,
        /TypeScript build failed: tsc build error/,
      );
    });
  });

  describe("printKitFirstDeployReport", () => {
    it("should report functions when present with bolded base names", async () => {
      const mockBuild: build.Build = {
        requiredAPIs: [],
        endpoints: {
          syncData: { entryPoint: "syncData" } as unknown as build.Endpoint,
          cleanUp: { entryPoint: "cleanUp" } as unknown as build.Endpoint,
        },
        params: [],
        requiredRoles: [],
      };

      const delegate = {
        discoverBuild: sinon.stub().resolves(mockBuild),
      };
      sinon
        .stub(runtimes, "getRuntimeDelegate")
        .resolves(delegate as unknown as runtimes.RuntimeDelegate);

      await printKitFirstDeployReport({}, "my-inst", "/mock/source");

      expect(loggerInfoStub).to.have.been.calledWith(
        sinon.match(/functions:/),
        sinon.match(
          `At the first deploy, the following functions will be created in your project:\n` +
            `- kit-my-inst-${clc.bold("cleanUp")}\n` +
            `- kit-my-inst-${clc.bold("syncData")}`,
        ),
      );
    });

    it("should report task queues with bolded base names when endpoints have taskQueueTrigger", async () => {
      const mockBuild: build.Build = {
        requiredAPIs: [],
        endpoints: {
          processTask: {
            entryPoint: "processTask",
            taskQueueTrigger: {},
          } as unknown as build.Endpoint,
        },
        params: [],
        requiredRoles: [],
      };

      const delegate = {
        discoverBuild: sinon.stub().resolves(mockBuild),
      };
      sinon
        .stub(runtimes, "getRuntimeDelegate")
        .resolves(delegate as unknown as runtimes.RuntimeDelegate);

      await printKitFirstDeployReport({}, "my-inst", "/mock/source");

      expect(loggerInfoStub).to.have.been.calledWith(
        sinon.match(/functions:/),
        sinon.match(
          `At the first deploy, the following Task Queues will be created in your project:\n` +
            `- kit-my-inst-${clc.bold("processTask")}`,
        ),
      );
    });

    it("should report eventarc channels when endpoints have eventTrigger with channel", async () => {
      const mockBuild: build.Build = {
        requiredAPIs: [],
        endpoints: {
          onCustomEvent: {
            entryPoint: "onCustomEvent",
            eventTrigger: {
              eventType: "custom.event",
              channel: "projects/p/locations/l/channels/my-channel",
              retry: false,
            },
          } as unknown as build.Endpoint,
        },
        params: [],
        requiredRoles: [],
      };

      const delegate = {
        discoverBuild: sinon.stub().resolves(mockBuild),
      };
      sinon
        .stub(runtimes, "getRuntimeDelegate")
        .resolves(delegate as unknown as runtimes.RuntimeDelegate);

      await printKitFirstDeployReport({}, "my-inst", "/mock/source");

      expect(loggerInfoStub).to.have.been.calledWith(
        sinon.match(/functions:/),
        sinon.match(
          "At the first deploy, the following Eventarc channels will be created in your project:\n" +
            "- projects/p/locations/l/channels/my-channel",
        ),
      );
    });

    it("should report required APIs when present", async () => {
      const mockBuild: build.Build = {
        requiredAPIs: [
          { api: "firestore.googleapis.com", reason: "Firestore access" },
          { api: "bigquery.googleapis.com", reason: "BigQuery export" },
        ],
        endpoints: {},
        params: [],
        requiredRoles: [],
      };

      const delegate = {
        discoverBuild: sinon.stub().resolves(mockBuild),
      };
      sinon
        .stub(runtimes, "getRuntimeDelegate")
        .resolves(delegate as unknown as runtimes.RuntimeDelegate);

      await printKitFirstDeployReport({}, "my-inst", "/mock/source");

      expect(loggerInfoStub).to.have.been.calledWith(
        sinon.match(/functions:/),
        sinon.match(
          "At the first deploy, the following APIs will be enabled in your project:\n" +
            "- bigquery.googleapis.com\n" +
            "- firestore.googleapis.com",
        ),
      );
    });

    it("should report required roles when present with formatted role names", async () => {
      const mockBuild: build.Build = {
        requiredAPIs: [],
        endpoints: {},
        params: [],
        requiredRoles: ["roles/datastore.user", "roles/bigquery.dataEditor"],
      };

      const delegate = {
        discoverBuild: sinon.stub().resolves(mockBuild),
      };
      sinon
        .stub(runtimes, "getRuntimeDelegate")
        .resolves(delegate as unknown as runtimes.RuntimeDelegate);
      sinon.stub(iam, "getRoleName").callsFake((role: string) => {
        if (role === "roles/datastore.user") return Promise.resolve("Cloud Datastore User");
        if (role === "roles/bigquery.dataEditor") return Promise.resolve("BigQuery Data Editor");
        return Promise.resolve(role);
      });

      await printKitFirstDeployReport({}, "my-inst", "/mock/source");

      expect(loggerInfoStub).to.have.been.calledWith(
        sinon.match(/functions:/),
        sinon.match(
          "At the first deploy, the following roles will be granted to the kit service account:\n" +
            "- BigQuery Data Editor\n" +
            "- Cloud Datastore User",
        ),
      );
    });

    it("should report all resources, APIs, roles, and CTA together when all are present", async () => {
      const mockBuild: build.Build = {
        requiredAPIs: [{ api: "bigquery.googleapis.com" }],
        endpoints: {
          taskEndpoint: {
            entryPoint: "taskEndpoint",
            taskQueueTrigger: {},
          } as unknown as build.Endpoint,
          eventEndpoint: {
            entryPoint: "eventEndpoint",
            eventTrigger: {
              eventType: "custom.event",
              channel: "projects/p/locations/l/channels/channel-1",
              retry: false,
            },
          } as unknown as build.Endpoint,
        },
        params: [],
        requiredRoles: ["roles/bigquery.dataEditor"],
      };

      const delegate = {
        discoverBuild: sinon.stub().resolves(mockBuild),
      };
      sinon
        .stub(runtimes, "getRuntimeDelegate")
        .resolves(delegate as unknown as runtimes.RuntimeDelegate);
      sinon.stub(iam, "getRoleName").resolves("BigQuery Data Editor");

      await printKitFirstDeployReport({}, "my-inst", "/mock/source");

      expect(loggerInfoStub).to.have.been.calledWith(
        sinon.match(/functions:/),
        sinon.match(
          "At the first deploy, the following functions will be created in your project:",
        ),
      );
      expect(loggerInfoStub).to.have.been.calledWith(
        sinon.match(/functions:/),
        sinon.match(
          `At the first deploy, the following Task Queues will be created in your project:\n` +
            `- kit-my-inst-${clc.bold("taskEndpoint")}`,
        ),
      );
      expect(loggerInfoStub).to.have.been.calledWith(
        sinon.match(/functions:/),
        sinon.match(
          "At the first deploy, the following Eventarc channels will be created in your project:\n" +
            "- projects/p/locations/l/channels/channel-1",
        ),
      );
      expect(loggerInfoStub).to.have.been.calledWith(
        sinon.match(/functions:/),
        sinon.match(
          "At the first deploy, the following APIs will be enabled in your project:\n" +
            "- bigquery.googleapis.com",
        ),
      );
      expect(loggerInfoStub).to.have.been.calledWith(
        sinon.match(/functions:/),
        sinon.match(
          "At the first deploy, the following roles will be granted to the kit service account:\n" +
            "- BigQuery Data Editor",
        ),
      );
      expect(loggerWarnStub).to.have.been.calledWith(
        sinon.match(/functions:/),
        sinon.match(
          `${clc.bold("Please review the changes above. If you do not want them applied to your project, uninstall this kit before running firebase deploy.")}`,
        ),
      );
    });

    it("should not print anything when there are no functions, APIs, roles, or resources", async () => {
      const mockBuild: build.Build = {
        requiredAPIs: [],
        endpoints: {},
        params: [],
        requiredRoles: [],
      };

      const delegate = {
        discoverBuild: sinon.stub().resolves(mockBuild),
      };
      sinon
        .stub(runtimes, "getRuntimeDelegate")
        .resolves(delegate as unknown as runtimes.RuntimeDelegate);

      await printKitFirstDeployReport({}, "my-inst", "/mock/source");

      expect(loggerInfoStub).to.not.have.been.called;
      expect(loggerWarnStub).to.not.have.been.called;
    });

    it("should handle discovery errors gracefully without throwing", async () => {
      sinon.stub(runtimes, "getRuntimeDelegate").rejects(new Error("Discovery failed"));

      await expect(printKitFirstDeployReport({}, "my-inst", "/mock/source")).to.not.be.rejected;
    });
  });

  describe("addKitInstanceOrConfigureProject", () => {
    it("should add an instance to existing kit when selected", async () => {
      const writtenFiles: Record<string, unknown> = {};
      const existingKit: ValidatedKitSingle = {
        kit: "firestore-bigquery-export",
        sourcePackage: { name: "@firebase-function-kits/firestore-bigquery-export" },
        source: "function-kits/firestore-bigquery-export/source",
        instances: {
          inst1: "function-kits/firestore-bigquery-export/config-inst1",
        },
      };
      const mockConfig = {
        projectDir: "/mock/project",
        src: {
          functions: [existingKit],
        },
        path: (p: string) => path.join("/mock/project", p),
        writeProjectFile: (file: string, content: unknown) => {
          writtenFiles[file] = content;
        },
      } as unknown as Config;

      sinon.stub(prompt, "select").resolves("addInstance");
      sinon.stub(prompt, "input").resolves("inst2");

      const res = await addKitInstanceOrConfigureProject(
        {
          config: mockConfig,
          project: "my-project",
        },
        existingKit,
        {
          existingFunctions: [existingKit],
          existingKitIds: new Set(["firestore-bigquery-export"]),
          existingCodebases: new Set(),
          existingInstanceIds: new Set(["inst1"]),
        },
      );

      expect(res).to.deep.equal({
        action: "addedInstance",
        kitId: "firestore-bigquery-export",
        instanceId: "inst2",
        sourcePath: "function-kits/firestore-bigquery-export/source",
        configDirPath: "function-kits/firestore-bigquery-export/config-inst2",
      });
      expect(existingKit.instances["inst2"]).to.equal(
        "function-kits/firestore-bigquery-export/config-inst2",
      );
    });

    it("should configure env for existing instance when selected", async () => {
      const existingKit: ValidatedKitSingle = {
        kit: "firestore-bigquery-export",
        sourcePackage: { name: "@firebase-function-kits/firestore-bigquery-export" },
        source: "function-kits/firestore-bigquery-export/source",
        instances: {
          inst1: "function-kits/firestore-bigquery-export/config-inst1",
        },
      };
      const mockConfig = {
        projectDir: "/mock/project",
        src: { functions: [existingKit] },
        path: (p: string) => path.join("/mock/project", p),
      } as unknown as Config;

      sinon.stub(prompt, "select").resolves("addEnv");

      const res = await addKitInstanceOrConfigureProject(
        {
          config: mockConfig,
          project: "my-project",
        },
        existingKit,
        {
          existingFunctions: [existingKit],
          existingKitIds: new Set(["firestore-bigquery-export"]),
          existingCodebases: new Set(),
          existingInstanceIds: new Set(["inst1"]),
        },
      );

      expect(res).to.deep.equal({
        action: "configuredEnv",
        kitId: "firestore-bigquery-export",
        instanceId: "inst1",
      });
    });
  });

  describe("installKitOrInstance", () => {
    it("should throw an error if neither package nor directory is provided", async () => {
      const mockConfig = {
        projectDir: "/mock/project",
        src: { functions: [] },
        path: (p: string) => path.join("/mock/project", p),
      } as unknown as Config;

      await expect(
        installKitOrInstance({
          config: mockConfig,
        }),
      ).to.be.rejectedWith(FirebaseError, "Must specify either --package or --directory.");
    });

    it("should throw an error if both package and directory are provided", async () => {
      const mockConfig = {
        projectDir: "/mock/project",
        src: { functions: [] },
        path: (p: string) => path.join("/mock/project", p),
      } as unknown as Config;

      await expect(
        installKitOrInstance({
          config: mockConfig,
          package: "@firebase-function-kits/firestore-bigquery-export",
          directory: "./my-kit",
        }),
      ).to.be.rejectedWith(
        FirebaseError,
        "Cannot specify both --package and --directory. Please choose one.",
      );
    });

    it("should throw an error if both directory and template are provided", async () => {
      const mockConfig = {
        projectDir: "/mock/project",
        src: { functions: [] },
        path: (p: string) => path.join("/mock/project", p),
      } as unknown as Config;

      await expect(
        installKitOrInstance({
          config: mockConfig,
          directory: "./my-kit",
          template: "migration",
        }),
      ).to.be.rejectedWith(FirebaseError, "Cannot specify --template with --directory.");
    });

    it("should throw an error if package has an invalid package name", async () => {
      const mockConfig = {
        projectDir: "/mock/project",
        src: { functions: [] },
        path: (p: string) => path.join("/mock/project", p),
      } as unknown as Config;

      await expect(
        installKitOrInstance({
          config: mockConfig,
          package: "@scope/pkg/extra@1.0.0",
        }),
      ).to.be.rejectedWith(FirebaseError, /Invalid NPM package name/);
    });

    it("should throw an error if template has an invalid template name", async () => {
      const mockConfig = {
        projectDir: "/mock/project",
        src: { functions: [] },
        path: (p: string) => path.join("/mock/project", p),
      } as unknown as Config;

      await expect(
        installKitOrInstance({
          config: mockConfig,
          package: "@firebase-function-kits/firestore-bigquery-export",
          template: "invalid-template" as unknown as TemplateType,
        }),
      ).to.be.rejectedWith(
        FirebaseError,
        "Invalid template 'invalid-template'. Template must be 'installation' or 'migration'.",
      );
    });

    it("should successfully install a first-party package kit", async () => {
      const writtenFiles: Record<string, unknown> = {};
      const mockConfig = {
        projectDir: "/mock/project",
        src: { functions: [] },
        path: (p: string) => path.join("/mock/project", p),
        writeProjectFile: (file: string, content: unknown) => {
          writtenFiles[file] = content;
        },
        askWriteProjectFile: (file: string, content: unknown) => {
          writtenFiles[file] = content;
          return Promise.resolve();
        },
      } as unknown as Config;

      const res = await installKitOrInstance({
        config: mockConfig,
        package: "@firebase-function-kits/firestore-bigquery-export@1.0.0",
        nonInteractive: true,
      });

      expect(res).to.deep.equal({
        action: "installedKit",
        kitId: "firestore-bigquery-export",
        instanceId: "firestore-bigquery-export",
        sourcePath: "function-kits/firestore-bigquery-export/source",
        configDirPath: "function-kits/firestore-bigquery-export/config-firestore-bigquery-export",
      });

      expect(wrapSpawnStub).to.have.been.calledTwice;
      expect(wrapSpawnStub.firstCall).to.have.been.calledWith(
        "npm",
        ["install", "@firebase-function-kits/firestore-bigquery-export@1.0.0", "--save-prefix=^"],
        "/mock/project/function-kits/firestore-bigquery-export/source",
      );
      expect(wrapSpawnStub.secondCall).to.have.been.calledWith(
        "npm",
        ["run", "build"],
        "/mock/project/function-kits/firestore-bigquery-export/source",
      );

      expect(writtenFiles["firebase.json"]).to.deep.equal({
        functions: [
          {
            kit: "firestore-bigquery-export",
            sourcePackage: {
              name: "@firebase-function-kits/firestore-bigquery-export",
            },
            source: "function-kits/firestore-bigquery-export/source",
            instances: {
              "firestore-bigquery-export":
                "function-kits/firestore-bigquery-export/config-firestore-bigquery-export",
            },
            predeploy: ['npm --prefix "$RESOURCE_DIR" run build'],
          },
        ],
      });
    });

    it("should accept custom kitId and instanceId for package kit", async () => {
      const writtenFiles: Record<string, unknown> = {};
      const mockConfig = {
        projectDir: "/mock/project",
        src: { functions: [] },
        path: (p: string) => path.join("/mock/project", p),
        writeProjectFile: (file: string, content: unknown) => {
          writtenFiles[file] = content;
        },
        askWriteProjectFile: (file: string, content: unknown) => {
          writtenFiles[file] = content;
          return Promise.resolve();
        },
      } as unknown as Config;

      const res = await installKitOrInstance({
        config: mockConfig,
        package: "@firebase-function-kits/firestore-bigquery-export@1.0.0",
        kitId: "custom-kit",
        instanceId: "custom-instance",
        nonInteractive: true,
      });

      expect(res).to.deep.equal({
        action: "installedKit",
        kitId: "custom-kit",
        instanceId: "custom-instance",
        sourcePath: "function-kits/custom-kit/source",
        configDirPath: "function-kits/custom-kit/config-custom-instance",
      });
    });

    it("should seed environment variables when seedEnv is provided for package kit", async () => {
      const writtenFiles: Record<string, unknown> = {};
      const mockConfig = {
        projectDir: "/mock/project",
        src: { functions: [] },
        path: (p: string) => path.join("/mock/project", p),
        writeProjectFile: (file: string, content: unknown) => {
          writtenFiles[file] = content;
        },
        askWriteProjectFile: (file: string, content: unknown) => {
          writtenFiles[file] = content;
          return Promise.resolve();
        },
      } as unknown as Config;

      await installKitOrInstance({
        config: mockConfig,
        package: "@firebase-function-kits/firestore-bigquery-export@1.0.0",
        nonInteractive: true,
        seedEnv: {
          projectId: "target-proj",
          envs: {
            PARAM_ONE: "value1",
          },
        },
      });

      expect(seedKitInstanceEnvStub).to.have.been.calledOnceWith({
        configDir: path.join(
          "/mock/project",
          "function-kits/firestore-bigquery-export/config-firestore-bigquery-export",
        ),
        functionsSource: path.join(
          "/mock/project",
          "function-kits/firestore-bigquery-export/source",
        ),
        projectDir: "/mock/project",
        projectId: "target-proj",
        projectAlias: undefined,
        envs: {
          PARAM_ONE: "value1",
        },
      });
    });

    it("should handle existing kit when package is already in firebase.json", async () => {
      const existingKit: ValidatedKitSingle = {
        kit: "firestore-bigquery-export",
        sourcePackage: { name: "@firebase-function-kits/firestore-bigquery-export" },
        source: "function-kits/firestore-bigquery-export/source",
        instances: {
          inst1: "function-kits/firestore-bigquery-export/config-inst1",
        },
      };
      const mockConfig = {
        projectDir: "/mock/project",
        src: { functions: [existingKit] },
        path: (p: string) => path.join("/mock/project", p),
        writeProjectFile: sinon.stub(),
        askWriteProjectFile: sinon.stub().resolves(),
      } as unknown as Config;

      const res = await installKitOrInstance({
        config: mockConfig,
        package: "@firebase-function-kits/firestore-bigquery-export",
        instanceId: "inst2",
        nonInteractive: true,
        project: "target-proj",
      });

      expect(res.action).to.equal("addedInstance");
      expect(res.kitId).to.equal("firestore-bigquery-export");
      expect(res.instanceId).to.equal("inst2");
    });

    it("should successfully install a directory kit with build script", async () => {
      const writtenFiles: Record<string, unknown> = {};
      const mockConfig = {
        projectDir: "/mock/project",
        src: { functions: [] },
        path: (p: string) => path.join("/mock/project", p),
        writeProjectFile: (file: string, content: unknown) => {
          writtenFiles[file] = content;
        },
        askWriteProjectFile: (file: string, content: unknown) => {
          writtenFiles[file] = content;
          return Promise.resolve();
        },
      } as unknown as Config;

      (fs.pathExists as sinon.SinonStub).withArgs("/mock/project/my-functions").resolves(true);
      (fs.pathExists as sinon.SinonStub)
        .withArgs(path.join("/mock/project/my-functions", "package.json"))
        .resolves(true);
      (fs.stat as sinon.SinonStub)
        .withArgs("/mock/project/my-functions")
        .resolves({ isDirectory: () => true } as fs.Stats);
      (fs.readJson as sinon.SinonStub)
        .withArgs(path.join("/mock/project/my-functions", "package.json"))
        .resolves({
          scripts: {
            build: "tsc",
          },
        });

      const res = await installKitOrInstance({
        config: mockConfig,
        directory: "./my-functions",
        nonInteractive: true,
      });

      expect(res).to.deep.equal({
        action: "installedKit",
        kitId: "my-functions",
        instanceId: "my-functions",
        sourcePath: "my-functions",
        configDirPath: "function-kits/my-functions/config-my-functions",
      });

      expect(wrapSpawnStub).to.have.been.calledTwice;
      expect(wrapSpawnStub.firstCall).to.have.been.calledWith(
        "npm",
        ["install"],
        "/mock/project/my-functions",
      );
      expect(wrapSpawnStub.secondCall).to.have.been.calledWith(
        "npm",
        ["run", "build"],
        "/mock/project/my-functions",
      );

      expect(writtenFiles["firebase.json"]).to.deep.equal({
        functions: [
          {
            kit: "my-functions",
            source: "my-functions",
            instances: {
              "my-functions": "function-kits/my-functions/config-my-functions",
            },
            predeploy: ['npm --prefix "$RESOURCE_DIR" run build'],
          },
        ],
      });
    });

    it("should successfully install a directory kit without build script", async () => {
      const writtenFiles: Record<string, unknown> = {};
      const mockConfig = {
        projectDir: "/mock/project",
        src: { functions: [] },
        path: (p: string) => path.join("/mock/project", p),
        writeProjectFile: (file: string, content: unknown) => {
          writtenFiles[file] = content;
        },
        askWriteProjectFile: (file: string, content: unknown) => {
          writtenFiles[file] = content;
          return Promise.resolve();
        },
      } as unknown as Config;

      (fs.pathExists as sinon.SinonStub).withArgs("/mock/project/my-functions").resolves(true);
      (fs.pathExists as sinon.SinonStub)
        .withArgs(path.join("/mock/project/my-functions", "package.json"))
        .resolves(true);
      (fs.stat as sinon.SinonStub)
        .withArgs("/mock/project/my-functions")
        .resolves({ isDirectory: () => true } as fs.Stats);
      (fs.readJson as sinon.SinonStub)
        .withArgs(path.join("/mock/project/my-functions", "package.json"))
        .resolves({
          scripts: {
            start: "node index.js",
          },
        });

      const res = await installKitOrInstance({
        config: mockConfig,
        directory: "./my-functions",
        nonInteractive: true,
      });

      expect(res).to.deep.equal({
        action: "installedKit",
        kitId: "my-functions",
        instanceId: "my-functions",
        sourcePath: "my-functions",
        configDirPath: "function-kits/my-functions/config-my-functions",
      });

      expect(wrapSpawnStub).to.have.been.calledOnce;
      expect(wrapSpawnStub.firstCall).to.have.been.calledWith(
        "npm",
        ["install"],
        "/mock/project/my-functions",
      );

      expect(writtenFiles["firebase.json"]).to.deep.equal({
        functions: [
          {
            kit: "my-functions",
            source: "my-functions",
            instances: {
              "my-functions": "function-kits/my-functions/config-my-functions",
            },
          },
        ],
      });
    });

    it("should accept custom kitId and instanceId for directory kit", async () => {
      const writtenFiles: Record<string, unknown> = {};
      const mockConfig = {
        projectDir: "/mock/project",
        src: { functions: [] },
        path: (p: string) => path.join("/mock/project", p),
        writeProjectFile: (file: string, content: unknown) => {
          writtenFiles[file] = content;
        },
        askWriteProjectFile: (file: string, content: unknown) => {
          writtenFiles[file] = content;
          return Promise.resolve();
        },
      } as unknown as Config;

      (fs.pathExists as sinon.SinonStub).withArgs("/mock/project/my-functions").resolves(true);
      (fs.pathExists as sinon.SinonStub)
        .withArgs(path.join("/mock/project/my-functions", "package.json"))
        .resolves(true);
      (fs.stat as sinon.SinonStub)
        .withArgs("/mock/project/my-functions")
        .resolves({ isDirectory: () => true } as fs.Stats);
      (fs.readJson as sinon.SinonStub)
        .withArgs(path.join("/mock/project/my-functions", "package.json"))
        .resolves({});

      const res = await installKitOrInstance({
        config: mockConfig,
        directory: "./my-functions",
        kitId: "custom-local-kit",
        instanceId: "custom-local-instance",
        nonInteractive: true,
      });

      expect(res).to.deep.equal({
        action: "installedKit",
        kitId: "custom-local-kit",
        instanceId: "custom-local-instance",
        sourcePath: "my-functions",
        configDirPath: "function-kits/custom-local-kit/config-custom-local-instance",
      });
    });

    it("should seed environment variables when seedEnv is provided for directory kit", async () => {
      const writtenFiles: Record<string, unknown> = {};
      const mockConfig = {
        projectDir: "/mock/project",
        src: { functions: [] },
        path: (p: string) => path.join("/mock/project", p),
        writeProjectFile: (file: string, content: unknown) => {
          writtenFiles[file] = content;
        },
        askWriteProjectFile: (file: string, content: unknown) => {
          writtenFiles[file] = content;
          return Promise.resolve();
        },
      } as unknown as Config;

      (fs.pathExists as sinon.SinonStub).withArgs("/mock/project/my-functions").resolves(true);
      (fs.pathExists as sinon.SinonStub)
        .withArgs(path.join("/mock/project/my-functions", "package.json"))
        .resolves(true);
      (fs.stat as sinon.SinonStub)
        .withArgs("/mock/project/my-functions")
        .resolves({ isDirectory: () => true } as fs.Stats);
      (fs.readJson as sinon.SinonStub)
        .withArgs(path.join("/mock/project/my-functions", "package.json"))
        .resolves({});

      await installKitOrInstance({
        config: mockConfig,
        directory: "./my-functions",
        nonInteractive: true,
        seedEnv: {
          projectId: "target-proj",
          envs: {
            PARAM_ONE: "value1",
          },
        },
      });

      expect(seedKitInstanceEnvStub).to.have.been.calledOnceWith({
        configDir: path.join("/mock/project", "function-kits/my-functions/config-my-functions"),
        functionsSource: "/mock/project/my-functions",
        projectDir: "/mock/project",
        projectId: "target-proj",
        projectAlias: undefined,
        envs: {
          PARAM_ONE: "value1",
        },
      });
    });

    it("should handle existing kit when directory is already in firebase.json", async () => {
      const existingKit: ValidatedKitSingle = {
        kit: "my-functions",
        source: "my-functions",
        instances: {
          inst1: "function-kits/my-functions/config-inst1",
        },
      };
      const mockConfig = {
        projectDir: "/mock/project",
        src: { functions: [existingKit] },
        path: (p: string) => path.join("/mock/project", p),
        writeProjectFile: sinon.stub(),
        askWriteProjectFile: sinon.stub().resolves(),
      } as unknown as Config;

      (fs.pathExists as sinon.SinonStub).withArgs("/mock/project/my-functions").resolves(true);
      (fs.pathExists as sinon.SinonStub)
        .withArgs(path.join("/mock/project/my-functions", "package.json"))
        .resolves(true);
      (fs.stat as sinon.SinonStub)
        .withArgs("/mock/project/my-functions")
        .resolves({ isDirectory: () => true } as fs.Stats);
      (fs.readJson as sinon.SinonStub)
        .withArgs(path.join("/mock/project/my-functions", "package.json"))
        .resolves({});

      const res = await installKitOrInstance({
        config: mockConfig,
        directory: "./my-functions",
        instanceId: "inst2",
        nonInteractive: true,
        project: "target-proj",
      });

      expect(res.action).to.equal("addedInstance");
      expect(res.kitId).to.equal("my-functions");
      expect(res.instanceId).to.equal("inst2");
    });
  });
});
