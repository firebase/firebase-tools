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
  addKitToConfig,
  findKitConfig,
  addInstanceToKitConfig,
  scaffoldKit,
  addInstanceToKit,
} from "./install";
import * as env from "./env";
import { Config } from "../../config";
import { FirebaseError } from "../../error";
import { KitFunctionConfig } from "../../firebaseConfig";

describe("functions/kits/install", () => {
  let seedKitInstanceEnvStub: sinon.SinonStub;

  beforeEach(() => {
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
      expect(isThirdPartyPackage("@firebase-functions-kits/firestore-bigquery-export")).to.be.false;
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
});
