import { expect } from "chai";
import * as sinon from "sinon";
import * as path from "path";
import * as fs from "fs-extra";

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
  addInstanceToKitConfig,
  buildAndInstallKit,
  scaffoldKit,
  addInstanceToKit,
  scaffoldKitFiles,
  FUNCTION_KITS_DIR,
} from "./install";
import * as env from "./env";
import * as initSpawn from "../../init/spawn";
import { Config } from "../../config";
import { FirebaseError } from "../../error";
import { ValidatedKitSingle } from "../projectConfig";

describe("functions/kits/install", () => {
  let wrapSpawnStub: sinon.SinonStub;
  let spawnWithOutputStub: sinon.SinonStub;
  let seedKitInstanceEnvStub: sinon.SinonStub;

  beforeEach(() => {
    wrapSpawnStub = sinon.stub(initSpawn, "wrapSpawn").resolves();
    spawnWithOutputStub = sinon
      .stub(initSpawn, "spawnWithOutput")
      .resolves(JSON.stringify([{ hasShrinkwrap: true }]));
    sinon.stub(fs, "ensureDir").resolves();
    sinon.stub(fs, "pathExists").resolves(false);
    sinon.stub(fs, "readJson").resolves({});
    sinon.stub(fs, "writeJson").resolves();
    sinon.stub(fs, "writeFile").resolves();
    seedKitInstanceEnvStub = sinon.stub(env, "seedKitInstanceEnv");
  });

  afterEach(() => {
    sinon.restore();
  });

  describe("validateNpmPackageName", () => {
    it("should accept valid package names", () => {
      expect(() => validateNpmPackageName("my-kit")).to.not.throw();
      expect(() =>
        validateNpmPackageName("@firebase-functions-kits/firestore-bigquery-export"),
      ).to.not.throw();
    });

    it("should reject invalid package names", () => {
      expect(() => validateNpmPackageName("foo/bar/baz")).to.throw(FirebaseError);
      expect(() => validateNpmPackageName("")).to.throw(FirebaseError);
    });
  });

  describe("generateUniqueId", () => {
    it("should return base ID if no collision", () => {
      expect(generateUniqueId("my-kit", new Set())).to.equal("my-kit");
    });

    it("should append suffix if collision occurs", () => {
      const existing = new Set(["my-kit"]);
      const unique = generateUniqueId("my-kit", existing);
      expect(unique).to.match(/^my-kit-[a-f0-9]{4}$/);
    });
  });

  describe("parseNpmPackageSpecifier", () => {
    it("should parse scoped package with version", () => {
      expect(parseNpmPackageSpecifier("@scope/pkg@1.0.0")).to.deep.equal({
        packageName: "@scope/pkg",
        version: "1.0.0",
      });
    });

    it("should parse package without version", () => {
      expect(parseNpmPackageSpecifier("@scope/pkg")).to.deep.equal({
        packageName: "@scope/pkg",
      });
    });
  });

  describe("sanitizePackageNameToKitName", () => {
    it("should strip scope and clean special characters", () => {
      expect(
        sanitizePackageNameToKitName("@firebase-functions-kits/firestore-bigquery-export"),
      ).to.equal("firestore-bigquery-export");
    });
  });

  describe("isThirdPartyPackage", () => {
    it("should return false for official firebase kit packages", () => {
      expect(
        isThirdPartyPackage("@firebase-functions-kits/firestore-bigquery-export"),
      ).to.be.false;
    });

    it("should return true for external packages", () => {
      expect(isThirdPartyPackage("@custom/my-kit")).to.be.true;
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
        "function-kits/new-kit/source",
        "function-kits/new-kit/config-new-instance",
      );

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
  });

  describe("addInstanceToKitConfig", () => {
    it("should add instance to existing kit in config and save", () => {
      const writtenFiles: Record<string, unknown> = {};
      const existingKit: ValidatedKitSingle = {
        kit: "my-kit",
        sourcePackage: { name: "@scope/pkg" },
        source: "function-kits/my-kit/source",
        instances: {
          inst1: "function-kits/my-kit/config-inst1",
        },
      };
      const mockConfig = {
        src: {
          functions: [existingKit],
        },
        writeProjectFile: (file: string, content: unknown) => {
          writtenFiles[file] = content;
        },
      } as unknown as Config;

      addInstanceToKitConfig(mockConfig, existingKit, "inst2", "function-kits/my-kit/config-inst2");

      expect(existingKit.instances).to.deep.equal({
        inst1: "function-kits/my-kit/config-inst1",
        inst2: "function-kits/my-kit/config-inst2",
      });
      expect(writtenFiles["firebase.json"]).to.deep.equal({
        functions: [existingKit],
      });
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
        version: "1.0.0",
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
      const existingKit: ValidatedKitSingle = {
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
          functions: [existingKit],
        },
        path: (rel: string) => path.join("/mock/project", rel),
        writeProjectFile: (file: string, content: unknown) => {
          writtenFiles[file] = content;
        },
      } as unknown as Config;

      const result = await addInstanceToKit({
        config: mockConfig,
        kit: existingKit,
        instanceId: "inst2",
      });

      expect(result.configDirPath).to.equal("function-kits/my-kit/config-inst2");
      expect(seedKitInstanceEnvStub).to.not.have.been.called;
      expect(existingKit.instances["inst2"]).to.equal("function-kits/my-kit/config-inst2");
    });

    it("should ensure config dir, seed .env.<project-id>, and update config when seedEnv is provided", async () => {
      const writtenFiles: Record<string, unknown> = {};
      const existingKit: ValidatedKitSingle = {
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
          functions: [existingKit],
        },
        path: (rel: string) => path.join("/mock/project", rel),
        writeProjectFile: (file: string, content: unknown) => {
          writtenFiles[file] = content;
        },
      } as unknown as Config;

      await addInstanceToKit({
        config: mockConfig,
        kit: existingKit,
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
      expect(existingKit.instances["inst2"]).to.equal("function-kits/my-kit/config-inst2");
    });
  });
});
