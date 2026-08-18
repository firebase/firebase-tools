import { expect } from "chai";
import * as sinon from "sinon";
import * as path from "path";
import * as fs from "fs-extra";

import {
  command,
  generateUniqueId,
  parseNpmPackageSpecifier,
  validateNpmPackageName,
  sanitizePackageNameToKitName,
  isThirdPartyPackage,
  checkPackageHasShrinkwrap,
  isKitConfiguredForProject,
  extractExistingFunctionsInfo,
  addKitToConfig,
  buildAndInstallKit,
  promptExistingInstanceForProject,
} from "./functions-kits-install";
import * as experiments from "../experiments";
import * as initSpawn from "../init/spawn";
import { Config } from "../config";
import { FirebaseError } from "../error";
import * as prompt from "../prompt";
import { logger } from "../logger";
import { ValidatedKitSingle } from "../functions/projectConfig";
import * as env from "../functions/env";

describe("functions:kits:install", () => {
  let assertEnabledStub: sinon.SinonStub;
  let wrapSpawnStub: sinon.SinonStub;
  let spawnWithOutputStub: sinon.SinonStub;
  let loggerInfoStub: sinon.SinonStub;
  let loggerWarnStub: sinon.SinonStub;

  beforeEach(() => {
    (command as unknown as { befores: unknown[] }).befores = [];
    sinon.stub(command, "prepare").resolves();
    assertEnabledStub = sinon.stub(experiments, "assertEnabled");
    wrapSpawnStub = sinon.stub(initSpawn, "wrapSpawn").resolves();
    spawnWithOutputStub = sinon
      .stub(initSpawn, "spawnWithOutput")
      .resolves(JSON.stringify([{ hasShrinkwrap: true }]));
    sinon.stub(fs, "ensureDir").resolves();
    sinon.stub(fs, "pathExists").resolves(false);
    sinon.stub(fs, "readJson").resolves({});
    sinon.stub(fs, "writeJson").resolves();
    sinon.stub(fs, "writeFile").resolves();
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
        validateNpmPackageName("@firebase-functions-kits/firestore-bigquery-export"),
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
        "@firebase-functions-kits/firestore-bigquery-export@1.0.0",
      );
      expect(res).to.deep.equal({
        packageName: "@firebase-functions-kits/firestore-bigquery-export",
        version: "1.0.0",
      });
    });

    it("should parse scoped package with release candidate version", () => {
      const res = parseNpmPackageSpecifier(
        "@firebase-functions-kits/firestore-bigquery-export@1.0.0-rc.1",
      );
      expect(res).to.deep.equal({
        packageName: "@firebase-functions-kits/firestore-bigquery-export",
        version: "1.0.0-rc.1",
      });
    });

    it("should parse scoped package with tag", () => {
      const res = parseNpmPackageSpecifier(
        "@firebase-functions-kits/firestore-bigquery-export@latest",
      );
      expect(res).to.deep.equal({
        packageName: "@firebase-functions-kits/firestore-bigquery-export",
        version: "latest",
      });
    });

    it("should parse scoped package without version", () => {
      const res = parseNpmPackageSpecifier("@firebase-functions-kits/firestore-bigquery-export");
      expect(res).to.deep.equal({
        packageName: "@firebase-functions-kits/firestore-bigquery-export",
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
        sanitizePackageNameToKitName("@firebase-functions-kits/firestore-bigquery-export"),
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
    it("should return false for packages under @firebase-functions-kits scope", () => {
      expect(isThirdPartyPackage("@firebase-functions-kits/firestore-bigquery-export")).to.be.false;
    });

    it("should return true for packages outside @firebase-functions-kits scope", () => {
      expect(isThirdPartyPackage("firebase-functions-kits")).to.be.true;
      expect(isThirdPartyPackage("@firebase-functions-kits-fake/foo")).to.be.true;
      expect(isThirdPartyPackage("@other-scope/my-kit")).to.be.true;
      expect(isThirdPartyPackage("third-party-kit")).to.be.true;
    });
  });

  describe("checkPackageHasShrinkwrap", () => {
    it("should return true when npm pack output includes hasShrinkwrap", async () => {
      spawnWithOutputStub.resolves(JSON.stringify([{ hasShrinkwrap: true }]));
      const res = await checkPackageHasShrinkwrap("@firebase-functions-kits/my-kit");
      expect(res).to.be.true;
    });

    it("should return true when npm pack files list includes npm-shrinkwrap.json", async () => {
      spawnWithOutputStub.resolves(JSON.stringify([{ files: [{ path: "npm-shrinkwrap.json" }] }]));
      const res = await checkPackageHasShrinkwrap("@firebase-functions-kits/my-kit");
      expect(res).to.be.true;
    });

    it("should return false when npm-shrinkwrap.json is not in package", async () => {
      spawnWithOutputStub.resolves(JSON.stringify([{ files: [{ path: "package.json" }] }]));
      const res = await checkPackageHasShrinkwrap("@firebase-functions-kits/my-kit");
      expect(res).to.be.false;
    });

    it("should return false when npm pack fails", async () => {
      spawnWithOutputStub.rejects(new Error("npm pack error"));
      const res = await checkPackageHasShrinkwrap("@firebase-functions-kits/my-kit");
      expect(res).to.be.false;
    });
  });

  describe("isKitConfiguredForProject", () => {
    let hasProjectEnvStub: sinon.SinonStub;

    beforeEach(() => {
      hasProjectEnvStub = sinon.stub(env, "hasProjectEnv");
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

      addKitToConfig(
        mockConfig,
        "new-kit",
        "new-instance",
        "@scope/pkg",
        "function-kits/new-kit",
        "function-kits/new-kit/config-new-instance",
      );

      expect(writtenFiles["firebase.json"]).to.deep.equal({
        functions: [
          {
            kit: "new-kit",
            sourcePackage: { name: "@scope/pkg" },
            source: "function-kits/new-kit",
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

      addKitToConfig(
        mockConfig,
        "new-kit",
        "new-instance",
        "@scope/pkg",
        "function-kits/new-kit",
        "function-kits/new-kit/config-new-instance",
      );

      const functions = (writtenFiles["firebase.json"] as { functions: unknown[] }).functions;
      expect(functions).to.have.length(2);
      expect(functions[0]).to.deep.equal(existingEntry);
      expect(functions[1]).to.deep.equal({
        kit: "new-kit",
        sourcePackage: { name: "@scope/pkg" },
        source: "function-kits/new-kit",
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

      addKitToConfig(
        mockConfig,
        "new-kit",
        "new-instance",
        "@scope/pkg",
        "function-kits/new-kit",
        "function-kits/new-kit/config-new-instance",
      );

      const functions = (writtenFiles["firebase.json"] as { functions: unknown[] }).functions;
      expect(functions).to.have.length(2);
      expect(functions[0]).to.deep.equal(existingEntry);
    });
  });

  describe("buildAndInstallKit", () => {
    it("should run npm install and npm run build without --ignore-scripts for first-party kit", async () => {
      await buildAndInstallKit("/abs/path", false);

      expect(wrapSpawnStub).to.have.been.calledTwice;
      expect(wrapSpawnStub.firstCall).to.have.been.calledWith("npm", ["install"], "/abs/path");
      expect(wrapSpawnStub.secondCall).to.have.been.calledWith(
        "npm",
        ["run", "build"],
        "/abs/path",
      );
      expect(loggerInfoStub).to.have.been.calledWith(
        sinon.match(/functions:/),
        sinon.match(/Running npm install\.\.\./),
      );
      expect(loggerInfoStub).to.have.been.calledWith(
        sinon.match(/functions:/),
        sinon.match(/Building TypeScript source\.\.\./),
      );
    });

    it("should run npm install with --ignore-scripts for third-party kit", async () => {
      await buildAndInstallKit("/abs/path", true);

      expect(wrapSpawnStub).to.have.been.calledTwice;
      expect(wrapSpawnStub.firstCall).to.have.been.calledWith(
        "npm",
        ["install", "--ignore-scripts"],
        "/abs/path",
      );
      expect(wrapSpawnStub.secondCall).to.have.been.calledWith(
        "npm",
        ["run", "build"],
        "/abs/path",
      );
      expect(loggerInfoStub).to.have.been.calledWith(
        sinon.match(/functions:/),
        sinon.match(/Running npm install --ignore-scripts\.\.\./),
      );
      expect(loggerInfoStub).to.have.been.calledWith(
        sinon.match(/functions:/),
        sinon.match(/Building TypeScript source\.\.\./),
      );
    });

    it("should throw FirebaseError if npm install fails", async () => {
      wrapSpawnStub.onFirstCall().rejects(new Error("npm install error"));

      await expect(buildAndInstallKit("/abs/path", false)).to.be.rejectedWith(
        FirebaseError,
        /NPM install failed: npm install error/,
      );
    });

    it("should throw FirebaseError if typescript build fails", async () => {
      wrapSpawnStub.onFirstCall().resolves();
      wrapSpawnStub.onSecondCall().rejects(new Error("tsc build error"));

      await expect(buildAndInstallKit("/abs/path", false)).to.be.rejectedWith(
        FirebaseError,
        /TypeScript build failed: tsc build error/,
      );
    });
  });

  describe("promptExistingInstanceForProject", () => {
    it("should throw if kit has no instances configured", async () => {
      const mockOptions = { project: "my-project" } as any;
      const kit = {
        kit: "my-kit",
        instances: {},
      } as unknown as ValidatedKitSingle;

      await expect(promptExistingInstanceForProject(mockOptions, kit)).to.be.rejectedWith(
        FirebaseError,
        /Kit 'my-kit' has no instances configured\./,
      );
    });

    it("should suggest deploy command directly when only one instance exists", async () => {
      const selectStub = sinon.stub(prompt, "select");
      const mockOptions = { project: "my-project" } as any;
      const kit = {
        kit: "my-kit",
        instances: {
          "inst-1": "function-kits/my-kit/config-inst-1",
        },
      } as unknown as ValidatedKitSingle;

      await promptExistingInstanceForProject(mockOptions, kit);

      expect(selectStub).to.not.have.been.called;
      expect(loggerInfoStub).to.have.been.calledWith(
        sinon.match(/functions:/),
        sinon.match(/firebase deploy --only functions:inst-1 --project my-project/),
      );
    });

    it("should prompt to select instance when multiple instances exist and nonInteractive is false", async () => {
      const selectStub = sinon.stub(prompt, "select").resolves("inst-2");
      const mockOptions = { project: "my-project", nonInteractive: false } as any;
      const kit = {
        kit: "my-kit",
        instances: {
          "inst-1": "function-kits/my-kit/config-inst-1",
          "inst-2": "function-kits/my-kit/config-inst-2",
        },
      } as unknown as ValidatedKitSingle;

      await promptExistingInstanceForProject(mockOptions, kit);

      expect(selectStub).to.have.been.calledOnce;
      expect(selectStub).to.have.been.calledWith(
        sinon.match({
          message: "Which instance would you like to configure for this project?",
          choices: [
            { name: "inst-1", value: "inst-1" },
            { name: "inst-2", value: "inst-2" },
          ],
        }),
      );
      expect(loggerInfoStub).to.have.been.calledWith(
        sinon.match(/functions:/),
        sinon.match(/firebase deploy --only functions:inst-2 --project my-project/),
      );
    });

    it("should suggest deploy command with instance placeholder when multiple instances exist and nonInteractive is true", async () => {
      const selectStub = sinon.stub(prompt, "select");
      const mockOptions = { project: "my-project", nonInteractive: true } as any;
      const kit = {
        kit: "my-kit",
        instances: {
          "inst-1": "function-kits/my-kit/config-inst-1",
          "inst-2": "function-kits/my-kit/config-inst-2",
        },
      } as unknown as ValidatedKitSingle;

      await promptExistingInstanceForProject(mockOptions, kit);

      expect(selectStub).to.not.have.been.called;
      expect(loggerInfoStub).to.have.been.calledWith(
        sinon.match(/functions:/),
        sinon.match(/firebase deploy --only functions:<instance-name> --project my-project/),
      );
    });
  });

  describe("command action", () => {
    it("should assert that kits experiment is enabled", async () => {
      assertEnabledStub.throws(new FirebaseError("kits experiment disabled"));

      await expect(
        command.runner()({
          npm_package: "@firebase-functions-kits/firestore-bigquery-export",
          cwd: "/mock/project",
          nonInteractive: true,
        }),
      ).to.be.rejectedWith(FirebaseError, "kits experiment disabled");

      expect(assertEnabledStub).to.have.been.calledWith("kits", "install a function kit");
    });

    it("should throw an error if not in a Firebase project directory", async () => {
      await expect(
        command.runner()({
          npm_package: "@firebase-functions-kits/firestore-bigquery-export",
          cwd: "/mock/project",
          nonInteractive: true,
        }),
      ).to.be.rejectedWith(FirebaseError, /firebase.json not found/);
    });

    it("should throw an error if --npm_package is not provided", async () => {
      const mockConfig = {
        projectDir: "/mock/project",
        src: {
          functions: [],
        },
        path: (p: string) => path.join("/mock/project", p),
      } as unknown as Config;

      await expect(
        command.runner()({
          cwd: "/mock/project",
          config: mockConfig,
          nonInteractive: true,
        }),
      ).to.be.rejectedWith(
        FirebaseError,
        /set the --npm_package option to a valid NPM package and try again\./,
      );
    });

    it("should throw an error if --npm_package has an invalid package name", async () => {
      const mockConfig = {
        projectDir: "/mock/project",
        src: {
          functions: [],
        },
        path: (p: string) => path.join("/mock/project", p),
      } as unknown as Config;

      await expect(
        command.runner()({
          npm_package: "@scope/pkg/extra@1.0.0",
          cwd: "/mock/project",
          config: mockConfig,
          nonInteractive: true,
        }),
      ).to.be.rejectedWith(FirebaseError, /Invalid NPM package name/);
    });

    it("should throw an error if --template has an invalid template name", async () => {
      const mockConfig = {
        projectDir: "/mock/project",
        src: {
          functions: [],
        },
        path: (p: string) => path.join("/mock/project", p),
      } as unknown as Config;

      await expect(
        command.runner()({
          npm_package: "@firebase-functions-kits/firestore-bigquery-export",
          template: "invalid-template",
          cwd: "/mock/project",
          config: mockConfig,
          nonInteractive: true,
        }),
      ).to.be.rejectedWith(
        FirebaseError,
        "Invalid template 'invalid-template'. Template must be 'installation' or 'migration'.",
      );
    });

    it("should use the migration template when --template migration is specified", async () => {
      const writtenFiles: Record<string, unknown> = {};

      const mockConfig = {
        projectDir: "/mock/project",
        src: {
          functions: [],
        },
        path: (p: string) => path.join("/mock/project", p),
        writeProjectFile: (file: string, content: unknown) => {
          writtenFiles[file] = content;
        },
        askWriteProjectFile: (file: string, content: unknown) => {
          writtenFiles[file] = content;
          return Promise.resolve();
        },
      } as unknown as Config;

      await command.runner()({
        npm_package: "@firebase-functions-kits/firestore-bigquery-export@1.0.0",
        template: "migration",
        cwd: "/mock/project",
        config: mockConfig,
        nonInteractive: true,
      });

      const indexContent = writtenFiles[
        "function-kits/firestore-bigquery-export/source/src/index.ts"
      ] as string;
      expect(indexContent).to.be.a("string");
      expect(indexContent).to.include("EXT_MIGRATED_SYSTEM_MEMORY");
      expect(indexContent).to.include(
        'export * from "@firebase-functions-kits/firestore-bigquery-export";',
      );
      expect(indexContent).to.not.include("{{PACKAGE_NAME}}");
    });

    it("should use the installation template by default or when explicitly specified", async () => {
      const writtenFiles: Record<string, unknown> = {};

      const mockConfig = {
        projectDir: "/mock/project",
        src: {
          functions: [],
        },
        path: (p: string) => path.join("/mock/project", p),
        writeProjectFile: (file: string, content: unknown) => {
          writtenFiles[file] = content;
        },
        askWriteProjectFile: (file: string, content: unknown) => {
          writtenFiles[file] = content;
          return Promise.resolve();
        },
      } as unknown as Config;

      await command.runner()({
        npm_package: "@firebase-functions-kits/firestore-bigquery-export@1.0.0",
        template: "installation",
        cwd: "/mock/project",
        config: mockConfig,
        nonInteractive: true,
      });

      const indexContent = writtenFiles[
        "function-kits/firestore-bigquery-export/source/src/index.ts"
      ] as string;
      expect(indexContent).to.be.a("string");
      expect(indexContent).to.include("maxInstances: 10");
      expect(indexContent).to.include(
        'export * from "@firebase-functions-kits/firestore-bigquery-export";',
      );
      expect(indexContent).to.not.include("{{PACKAGE_NAME}}");
    });

    it("should successfully install a first-party kit into firebase.json", async () => {
      const writtenFiles: Record<string, unknown> = {};

      const mockConfig = {
        projectDir: "/mock/project",
        src: {
          functions: [],
        },
        path: (p: string) => path.join("/mock/project", p),
        writeProjectFile: (file: string, content: unknown) => {
          writtenFiles[file] = content;
        },
        askWriteProjectFile: (file: string, content: unknown) => {
          writtenFiles[file] = content;
          return Promise.resolve();
        },
      } as unknown as Config;

      await command.runner()({
        npm_package: "@firebase-functions-kits/firestore-bigquery-export@1.0.0",
        cwd: "/mock/project",
        config: mockConfig,
        nonInteractive: true,
      });

      expect(wrapSpawnStub).to.have.been.calledTwice;
      expect(wrapSpawnStub.firstCall).to.have.been.calledWith(
        "npm",
        ["install"],
        "/mock/project/function-kits/firestore-bigquery-export/source",
      );
      expect(wrapSpawnStub.secondCall).to.have.been.calledWith(
        "npm",
        ["run", "build"],
        "/mock/project/function-kits/firestore-bigquery-export/source",
      );

      const pkgJsonResult = writtenFiles[
        "function-kits/firestore-bigquery-export/source/package.json"
      ] as { name?: string; dependencies?: Record<string, string> };
      expect(pkgJsonResult.name).to.equal("firestore-bigquery-export-wrapper");
      expect(pkgJsonResult.dependencies).to.have.property(
        "@firebase-functions-kits/firestore-bigquery-export",
        "1.0.0",
      );

      expect(writtenFiles["function-kits/firestore-bigquery-export/source/src/index.ts"]).to.be.a(
        "string",
      );
      expect(
        writtenFiles["function-kits/firestore-bigquery-export/source/src/index.ts"] as string,
      ).to.include('export * from "@firebase-functions-kits/firestore-bigquery-export";');

      expect(writtenFiles["firebase.json"]).to.deep.equal({
        functions: [
          {
            kit: "firestore-bigquery-export",
            sourcePackage: {
              name: "@firebase-functions-kits/firestore-bigquery-export",
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

      expect(loggerInfoStub).to.have.been.calledWith(
        sinon.match(/functions:/),
        sinon.match(/Function kit .*firestore-bigquery-export.* successfully installed\./),
      );
    });

    it("should prompt and allow custom kit ID and instance ID", async () => {
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

      sinon
        .stub(prompt, "input")
        .onFirstCall()
        .resolves("my-custom-kit")
        .onSecondCall()
        .resolves("my-instance");

      await command.runner()({
        npm_package: "@firebase-functions-kits/firestore-bigquery-export@1.0.0",
        cwd: "/mock/project",
        config: mockConfig,
      });

      expect(wrapSpawnStub).to.have.been.calledTwice;
      expect(wrapSpawnStub.firstCall).to.have.been.calledWith(
        "npm",
        ["install"],
        "/mock/project/function-kits/my-custom-kit/source",
      );

      expect(writtenFiles["firebase.json"]).to.deep.equal({
        functions: [
          {
            kit: "my-custom-kit",
            sourcePackage: {
              name: "@firebase-functions-kits/firestore-bigquery-export",
            },
            source: "function-kits/my-custom-kit/source",
            instances: {
              "my-instance": "function-kits/my-custom-kit/config-my-instance",
            },
            predeploy: ['npm --prefix "$RESOURCE_DIR" run build'],
          },
        ],
      });
    });

    it("should run npm install with --ignore-scripts for third-party packages", async () => {
      sinon.stub(prompt, "confirm").resolves(true);

      const mockConfig = {
        projectDir: "/mock/project",
        src: { functions: [] },
        path: (p: string) => path.join("/mock/project", p),
        writeProjectFile: sinon.stub(),
        askWriteProjectFile: sinon.stub().resolves(),
      } as unknown as Config;

      await command.runner()({
        npm_package: "@third-party/custom-kit",
        cwd: "/mock/project",
        config: mockConfig,
        nonInteractive: true,
      });

      expect(wrapSpawnStub).to.have.been.calledTwice;
      expect(wrapSpawnStub.firstCall).to.have.been.calledWith(
        "npm",
        ["install", "--ignore-scripts"],
        "/mock/project/function-kits/custom-kit/source",
      );
      expect(wrapSpawnStub.secondCall).to.have.been.calledWith(
        "npm",
        ["run", "build"],
        "/mock/project/function-kits/custom-kit/source",
      );
    });

    it("should reject duplicate kit name if entered interactively", async () => {
      const mockConfig = {
        projectDir: "/mock/project",
        src: {
          functions: [
            {
              kit: "firestore-bigquery-export",
              source: "function-kits/firestore-bigquery-export",
              instances: {
                inst1: "function-kits/firestore-bigquery-export/config-inst1",
              },
            },
          ],
        },
        path: (p: string) => path.join("/mock/project", p),
        writeProjectFile: sinon.stub(),
        askWriteProjectFile: sinon.stub().resolves(),
      } as unknown as Config;

      sinon.stub(prompt, "input").onFirstCall().resolves("firestore-bigquery-export");

      await expect(
        command.runner()({
          npm_package: "@firebase-functions-kits/firestore-bigquery-export",
          cwd: "/mock/project",
          config: mockConfig,
        }),
      ).to.be.rejectedWith(FirebaseError, /functions.kit must be unique/);
    });

    it("should auto-generate unique kit ID and instance ID in non-interactive mode on collision", async () => {
      const writtenFiles: Record<string, unknown> = {};
      const mockConfig = {
        projectDir: "/mock/project",
        src: {
          functions: [
            {
              kit: "firestore-bigquery-export",
              source: "function-kits/firestore-bigquery-export",
              instances: {
                inst1: "function-kits/firestore-bigquery-export/config-inst1",
              },
            },
          ],
        },
        path: (p: string) => path.join("/mock/project", p),
        writeProjectFile: (file: string, content: unknown) => {
          writtenFiles[file] = content;
        },
        askWriteProjectFile: (file: string, content: unknown) => {
          writtenFiles[file] = content;
          return Promise.resolve();
        },
      } as unknown as Config;

      await command.runner()({
        npm_package: "@firebase-functions-kits/firestore-bigquery-export@1.0.0",
        cwd: "/mock/project",
        config: mockConfig,
        nonInteractive: true,
      });

      const updatedFunctions = (
        writtenFiles["firebase.json"] as { functions: Array<{ kit?: string }> }
      ).functions;
      expect(updatedFunctions).to.have.length(2);
      const installedKit = updatedFunctions[1];
      expect(installedKit.kit).to.match(/^firestore-bigquery-export-[a-f0-9]{4}$/);
    });

    it("should reject instance ID that collides with codebase name if entered interactively", async () => {
      const mockConfig = {
        projectDir: "/mock/project",
        src: {
          functions: [
            {
              codebase: "my-custom-instance",
              source: "functions",
            },
          ],
        },
        path: (p: string) => path.join("/mock/project", p),
        writeProjectFile: sinon.stub(),
        askWriteProjectFile: sinon.stub().resolves(),
      } as unknown as Config;

      sinon
        .stub(prompt, "input")
        .onFirstCall()
        .resolves("my-kit")
        .onSecondCall()
        .resolves("my-custom-instance");

      await expect(
        command.runner()({
          npm_package: "@firebase-functions-kits/my-kit",
          cwd: "/mock/project",
          config: mockConfig,
        }),
      ).to.be.rejectedWith(FirebaseError, /must be mutually exclusive/);
    });

    it("should reject instance ID that collides with another kit instance ID if entered interactively", async () => {
      const mockConfig = {
        projectDir: "/mock/project",
        src: {
          functions: [
            {
              kit: "other-kit",
              source: "function-kits/other-kit",
              instances: {
                "existing-instance": "function-kits/other-kit/config-existing-instance",
              },
            },
          ],
        },
        path: (p: string) => path.join("/mock/project", p),
        writeProjectFile: sinon.stub(),
        askWriteProjectFile: sinon.stub().resolves(),
      } as unknown as Config;

      sinon
        .stub(prompt, "input")
        .onFirstCall()
        .resolves("my-kit")
        .onSecondCall()
        .resolves("existing-instance");

      await expect(
        command.runner()({
          npm_package: "@firebase-functions-kits/my-kit",
          cwd: "/mock/project",
          config: mockConfig,
        }),
      ).to.be.rejectedWith(
        FirebaseError,
        /functions kit instance ID must be unique across all kits, but 'existing-instance' was used more than once/,
      );
    });

    it("should prompt confirmation when a first-party kit lacks npm-shrinkwrap.json", async () => {
      spawnWithOutputStub.resolves(JSON.stringify([{ files: [{ path: "package.json" }] }]));
      const confirmStub = sinon.stub(prompt, "confirm").resolves(true);

      const mockConfig = {
        projectDir: "/mock/project",
        src: { functions: [] },
        path: (p: string) => path.join("/mock/project", p),
        writeProjectFile: sinon.stub(),
        askWriteProjectFile: sinon.stub().resolves(),
      } as unknown as Config;

      await command.runner()({
        npm_package: "@firebase-functions-kits/my-kit",
        cwd: "/mock/project",
        config: mockConfig,
        nonInteractive: true,
      });

      expect(confirmStub).to.have.been.calledOnceWith({
        message:
          "Are you sure you want to install @firebase-functions-kits/my-kit without locked dependencies?",
        default: false,
        nonInteractive: true,
      });
      expect(loggerWarnStub).to.have.been.calledWith(
        sinon.match(/functions:/),
        sinon.match(/does not have an npm-shrinkwrap\.json file/),
      );
    });

    it("should prompt confirmation when a third-party kit has npm-shrinkwrap.json", async () => {
      spawnWithOutputStub.resolves(JSON.stringify([{ hasShrinkwrap: true }]));
      const confirmStub = sinon.stub(prompt, "confirm").resolves(true);

      const mockConfig = {
        projectDir: "/mock/project",
        src: { functions: [] },
        path: (p: string) => path.join("/mock/project", p),
        writeProjectFile: sinon.stub(),
        askWriteProjectFile: sinon.stub().resolves(),
      } as unknown as Config;

      await command.runner()({
        npm_package: "@third-party/custom-kit",
        cwd: "/mock/project",
        config: mockConfig,
        nonInteractive: true,
      });

      expect(confirmStub).to.have.been.calledOnceWith({
        message: "Are you sure you want to install the third-party kit @third-party/custom-kit?",
        default: false,
        nonInteractive: true,
      });
      expect(loggerWarnStub).to.have.been.calledWith(
        sinon.match(/functions:/),
        sinon.match(/is a third-party kit/),
      );
    });

    it("should prompt confirmation when a third-party kit lacks npm-shrinkwrap.json", async () => {
      spawnWithOutputStub.resolves(JSON.stringify([{ files: [{ path: "package.json" }] }]));
      const confirmStub = sinon.stub(prompt, "confirm").resolves(true);

      const mockConfig = {
        projectDir: "/mock/project",
        src: { functions: [] },
        path: (p: string) => path.join("/mock/project", p),
        writeProjectFile: sinon.stub(),
        askWriteProjectFile: sinon.stub().resolves(),
      } as unknown as Config;

      await command.runner()({
        npm_package: "@third-party/custom-kit",
        cwd: "/mock/project",
        config: mockConfig,
        nonInteractive: true,
      });

      expect(confirmStub).to.have.been.calledOnceWith({
        message:
          "Are you sure you want to install the third-party kit @third-party/custom-kit without locked dependencies?",
        default: false,
        nonInteractive: true,
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

    it("should cancel installation if user declines confirmation for first-party kit without shrinkwrap", async () => {
      spawnWithOutputStub.resolves(JSON.stringify([{ files: [{ path: "package.json" }] }]));
      sinon.stub(prompt, "confirm").resolves(false);

      const mockConfig = {
        projectDir: "/mock/project",
        src: { functions: [] },
        path: (p: string) => path.join("/mock/project", p),
        writeProjectFile: sinon.stub(),
      } as unknown as Config;

      await expect(
        command.runner()({
          npm_package: "@firebase-functions-kits/my-kit",
          cwd: "/mock/project",
          config: mockConfig,
          nonInteractive: true,
        }),
      ).to.be.rejectedWith(FirebaseError, "Installation cancelled.");
    });

    it("should cancel installation if user declines confirmation for third-party kit with shrinkwrap", async () => {
      spawnWithOutputStub.resolves(JSON.stringify([{ hasShrinkwrap: true }]));
      sinon.stub(prompt, "confirm").resolves(false);

      const mockConfig = {
        projectDir: "/mock/project",
        src: { functions: [] },
        path: (p: string) => path.join("/mock/project", p),
        writeProjectFile: sinon.stub(),
      } as unknown as Config;

      await expect(
        command.runner()({
          npm_package: "@third-party/custom-kit",
          cwd: "/mock/project",
          config: mockConfig,
          nonInteractive: true,
        }),
      ).to.be.rejectedWith(FirebaseError, "Installation cancelled.");
    });

    it("should cancel installation if user declines confirmation for third-party kit without shrinkwrap", async () => {
      spawnWithOutputStub.resolves(JSON.stringify([{ files: [{ path: "package.json" }] }]));
      sinon.stub(prompt, "confirm").resolves(false);

      const mockConfig = {
        projectDir: "/mock/project",
        src: { functions: [] },
        path: (p: string) => path.join("/mock/project", p),
        writeProjectFile: sinon.stub(),
      } as unknown as Config;

      await expect(
        command.runner()({
          npm_package: "@third-party/custom-kit",
          cwd: "/mock/project",
          config: mockConfig,
          nonInteractive: true,
        }),
      ).to.be.rejectedWith(FirebaseError, "Installation cancelled.");
    });

    describe("subsequent (2+) installs for already installed package", () => {
      it("should add an instance in non-interactive mode when no current project dotenv exists", async () => {
        const writtenFiles: Record<string, unknown> = {};
        const mockConfig = {
          projectDir: "/mock/project",
          src: {
            functions: [
              {
                kit: "firestore-bigquery-export",
                sourcePackage: {
                  name: "@firebase-functions-kits/firestore-bigquery-export",
                },
                source: "function-kits/firestore-bigquery-export",
                instances: {
                  "firestore-bigquery-export":
                    "function-kits/firestore-bigquery-export/config-firestore-bigquery-export",
                },
                predeploy: ['npm --prefix "$RESOURCE_DIR" run build'],
              },
            ],
          },
          path: (p: string) => path.join("/mock/project", p),
          writeProjectFile: (file: string, content: unknown) => {
            writtenFiles[file] = content;
          },
          askWriteProjectFile: (file: string, content: unknown) => {
            writtenFiles[file] = content;
            return Promise.resolve();
          },
        } as unknown as Config;

        await command.runner()({
          npm_package: "@firebase-functions-kits/firestore-bigquery-export",
          cwd: "/mock/project",
          config: mockConfig,
          nonInteractive: true,
          project: "my-target-proj",
        });

        // NPM install and build should NOT run on subsequent install
        expect(wrapSpawnStub).to.not.have.been.called;

        const updatedFunctions = (
          writtenFiles["firebase.json"] as {
            functions: Array<{
              kit?: string;
              instances?: Record<string, string>;
            }>;
          }
        ).functions;
        expect(updatedFunctions).to.have.length(1);
        const instances = updatedFunctions[0].instances || {};
        const instanceKeys = Object.keys(instances);
        expect(instanceKeys).to.have.length(2);
        expect(instanceKeys[0]).to.equal("firestore-bigquery-export");
        expect(instanceKeys[1]).to.match(/^firestore-bigquery-export-[a-f0-9]{4}$/);
        expect(instances[instanceKeys[1]]).to.equal(
          `function-kits/firestore-bigquery-export/config-${instanceKeys[1]}`,
        );
      });

      it("should add an instance interactively with a custom name when no current project dotenv exists", async () => {
        const writtenFiles: Record<string, unknown> = {};
        const mockConfig = {
          projectDir: "/mock/project",
          src: {
            functions: [
              {
                kit: "firestore-bigquery-export",
                sourcePackage: {
                  name: "@firebase-functions-kits/firestore-bigquery-export",
                },
                source: "function-kits/firestore-bigquery-export",
                instances: {
                  "inst-1": "function-kits/firestore-bigquery-export/config-inst-1",
                },
                predeploy: ['npm --prefix "$RESOURCE_DIR" run build'],
              },
            ],
          },
          path: (p: string) => path.join("/mock/project", p),
          writeProjectFile: (file: string, content: unknown) => {
            writtenFiles[file] = content;
          },
          askWriteProjectFile: (file: string, content: unknown) => {
            writtenFiles[file] = content;
            return Promise.resolve();
          },
        } as unknown as Config;

        const selectStub = sinon.stub(prompt, "select").resolves("addInstance");
        sinon.stub(prompt, "input").resolves("custom-instance-2");

        await command.runner()({
          npm_package: "@firebase-functions-kits/firestore-bigquery-export",
          cwd: "/mock/project",
          config: mockConfig,
          project: "my-target-proj",
        });

        expect(wrapSpawnStub).to.not.have.been.called;
        expect(selectStub).to.have.been.calledOnce;
        expect(selectStub).to.have.been.calledWith(
          sinon.match({
            message:
              "The following instances already exist, but are not configured for this project: inst-1. What would you like to do?",
          }),
        );

        const updatedFunctions = (
          writtenFiles["firebase.json"] as {
            functions: Array<{
              kit?: string;
              instances?: Record<string, string>;
            }>;
          }
        ).functions;
        const instances = updatedFunctions[0].instances || {};
        expect(instances).to.deep.equal({
          "inst-1": "function-kits/firestore-bigquery-export/config-inst-1",
          "custom-instance-2": "function-kits/firestore-bigquery-export/config-custom-instance-2",
        });
      });

      it("should directly add an instance without prompting action or logging deploy suggestion when current project dotenv already exists", async () => {
        const writtenFiles: Record<string, unknown> = {};
        const mockConfig = {
          projectDir: "/mock/project",
          src: {
            functions: [
              {
                kit: "firestore-bigquery-export",
                sourcePackage: {
                  name: "@firebase-functions-kits/firestore-bigquery-export",
                },
                source: "function-kits/firestore-bigquery-export",
                instances: {
                  "inst-1": "function-kits/firestore-bigquery-export/config-inst-1",
                },
              },
            ],
          },
          path: (p: string) => path.join("/mock/project", p),
          writeProjectFile: (file: string, content: unknown) => {
            writtenFiles[file] = content;
          },
          askWriteProjectFile: (file: string, content: unknown) => {
            writtenFiles[file] = content;
            return Promise.resolve();
          },
        } as unknown as Config;

        sinon.stub(env, "hasProjectEnv").returns(true);

        const selectStub = sinon.stub(prompt, "select");
        sinon.stub(prompt, "input").resolves("inst-2");

        await command.runner()({
          npm_package: "@firebase-functions-kits/firestore-bigquery-export",
          cwd: "/mock/project",
          config: mockConfig,
          project: "my-target-proj",
        });

        // select should NOT be called to ask addInstance vs addEnv
        expect(selectStub).to.not.have.been.called;

        const updatedFunctions = (
          writtenFiles["firebase.json"] as {
            functions: Array<{
              kit?: string;
              instances?: Record<string, string>;
            }>;
          }
        ).functions;
        const instances = updatedFunctions[0].instances || {};
        expect(instances).to.deep.equal({
          "inst-1": "function-kits/firestore-bigquery-export/config-inst-1",
          "inst-2": "function-kits/firestore-bigquery-export/config-inst-2",
        });

        // Should log info message that package is already installed as kit
        expect(loggerInfoStub).to.have.been.calledWith(
          sinon.match(/functions:/),
          sinon.match(
            /This package is already installed as kit firestore-bigquery-export, creating a new instance\./,
          ),
        );

        // Should not log deploy suggestion when already configured for project
        expect(loggerInfoStub).to.not.have.been.calledWith(
          sinon.match(/To create a new instance in this project, deploy/),
        );
      });

      it("should reject duplicate instance ID when adding instance interactively", async () => {
        const mockConfig = {
          projectDir: "/mock/project",
          src: {
            functions: [
              {
                kit: "firestore-bigquery-export",
                sourcePackage: {
                  name: "@firebase-functions-kits/firestore-bigquery-export",
                },
                source: "function-kits/firestore-bigquery-export",
                instances: {
                  "inst-1": "function-kits/firestore-bigquery-export/config-inst-1",
                },
              },
            ],
          },
          path: (p: string) => path.join("/mock/project", p),
          writeProjectFile: sinon.stub(),
        } as unknown as Config;

        sinon.stub(prompt, "select").resolves("addInstance");
        sinon.stub(prompt, "input").resolves("inst-1");

        await expect(
          command.runner()({
            npm_package: "@firebase-functions-kits/firestore-bigquery-export",
            cwd: "/mock/project",
            config: mockConfig,
          }),
        ).to.be.rejectedWith(
          FirebaseError,
          /functions kit instance ID must be unique across all kits/,
        );
      });

      it("should suggest deploy command when configuring single instance with active project", async () => {
        const writeProjectFileStub = sinon.stub();
        const mockConfig = {
          projectDir: "/mock/project",
          src: {
            functions: [
              {
                kit: "firestore-bigquery-export",
                sourcePackage: {
                  name: "@firebase-functions-kits/firestore-bigquery-export",
                },
                source: "function-kits/firestore-bigquery-export",
                instances: {
                  "inst-1": "function-kits/firestore-bigquery-export/config-inst-1",
                },
              },
            ],
          },
          path: (p: string) => path.join("/mock/project", p),
          writeProjectFile: writeProjectFileStub,
        } as unknown as Config;

        sinon.stub(prompt, "select").resolves("addEnv");

        await command.runner()({
          npm_package: "@firebase-functions-kits/firestore-bigquery-export",
          cwd: "/mock/project",
          config: mockConfig,
          project: "my-staging-project",
        });

        expect(writeProjectFileStub).to.not.have.been.called;
        expect(loggerInfoStub).to.have.been.calledWith(
          sinon.match(/functions:/),
          sinon.match(/firebase deploy --only functions:inst-1 --project my-staging-project/),
        );
      });

      it("should suggest deploy command with placeholder when no active project is configured", async () => {
        const writeProjectFileStub = sinon.stub();
        const mockConfig = {
          projectDir: "/mock/project",
          src: {
            functions: [
              {
                kit: "firestore-bigquery-export",
                sourcePackage: {
                  name: "@firebase-functions-kits/firestore-bigquery-export",
                },
                source: "function-kits/firestore-bigquery-export",
                instances: {
                  "inst-1": "function-kits/firestore-bigquery-export/config-inst-1",
                },
              },
            ],
          },
          path: (p: string) => path.join("/mock/project", p),
          writeProjectFile: writeProjectFileStub,
        } as unknown as Config;

        sinon.stub(prompt, "select").resolves("addEnv");

        await command.runner()({
          npm_package: "@firebase-functions-kits/firestore-bigquery-export",
          cwd: "/mock/project",
          config: mockConfig,
        });

        expect(writeProjectFileStub).to.not.have.been.called;
        expect(loggerInfoStub).to.have.been.calledWith(
          sinon.match(/functions:/),
          sinon.match(/firebase deploy --only functions:inst-1 --project <project-name>/),
        );
      });

      it("should prompt to select instance when multiple instances exist for configuring instance in project", async () => {
        const mockConfig = {
          projectDir: "/mock/project",
          src: {
            functions: [
              {
                kit: "firestore-bigquery-export",
                sourcePackage: {
                  name: "@firebase-functions-kits/firestore-bigquery-export",
                },
                source: "function-kits/firestore-bigquery-export",
                instances: {
                  "inst-1": "function-kits/firestore-bigquery-export/config-inst-1",
                  "inst-2": "function-kits/firestore-bigquery-export/config-inst-2",
                },
              },
            ],
          },
          path: (p: string) => path.join("/mock/project", p),
          writeProjectFile: sinon.stub(),
        } as unknown as Config;

        const selectStub = sinon.stub(prompt, "select");
        selectStub.onFirstCall().resolves("addEnv");
        selectStub.onSecondCall().resolves("inst-2");

        await command.runner()({
          npm_package: "@firebase-functions-kits/firestore-bigquery-export",
          cwd: "/mock/project",
          config: mockConfig,
          project: "prod-project",
        });

        expect(selectStub).to.have.been.calledTwice;
        expect(selectStub.firstCall).to.have.been.calledWith(
          sinon.match({
            message:
              "The following instances already exist, but are not configured for this project: inst-1, inst-2. What would you like to do?",
          }),
        );
        expect(selectStub.secondCall).to.have.been.calledWith(
          sinon.match({
            message: "Which instance would you like to configure for this project?",
          }),
        );
        expect(loggerInfoStub).to.have.been.calledWith(
          sinon.match(/functions:/),
          sinon.match(/firebase deploy --only functions:inst-2 --project prod-project/),
        );
      });
    });
  });
});
