import { expect } from "chai";
import * as sinon from "sinon";
import * as path from "path";
import * as fs from "fs-extra";
import * as clc from "colorette";

import {
  generateUniqueId,
  getUnconfiguredInstancesForProject,
  extractExistingFunctionsInfo,
  addKitToConfig,
  findKitConfig,
  addInstanceToKitConfig,
  addInstanceToKit,
  promptKitInstanceId,
  promptKitId,
  promptExistingInstanceForProject,
  discoverKitBuild,
  printKitFirstDeployReport,
  resolveOrCreateInstance,
  configureInstanceForProject,
  installKitOrInstance,
  promptAndWriteKitParams,
  revertFunctionsConfig,
  TemplateType,
} from "./install";
import * as env from "./env";
import * as functionsEnv from "../env";
import * as build from "../../deploy/functions/build";
import * as params from "../../deploy/functions/params";
import * as functionsConfig from "../../functionsConfig";
import * as runtimes from "../../deploy/functions/runtimes";
import * as supported from "../../deploy/functions/runtimes/supported";
import * as iam from "../../gcp/iam";
import * as initSpawn from "../../init/spawn";
import * as prompt from "../../prompt";
import { Config } from "../../config";
import { FirebaseError } from "../../error";
import { KitFunctionConfig } from "../../firebaseConfig";
import { ValidatedKitSingle } from "../projectConfig";
import { logger } from "../../logger";
import * as experiments from "../../experiments";
import * as utils from "../../utils";

describe("functions/kits/install", () => {
  let wrapSpawnStub: sinon.SinonStub;
  let spawnWithOutputStub: sinon.SinonStub;
  let seedKitInstanceEnvStub: sinon.SinonStub;
  let loggerInfoStub: sinon.SinonStub;
  let loggerWarnStub: sinon.SinonStub;
  let fsRemoveStub: sinon.SinonStub;
  let fsReaddirStub: sinon.SinonStub;
  let getFirebaseConfigStub: sinon.SinonStub;
  let getRuntimeDelegateStub: sinon.SinonStub;
  let discoverBuildStub: sinon.SinonStub;

  beforeEach(() => {
    sinon.stub(experiments, "assertEnabled");
    sinon.stub(experiments, "isEnabled").withArgs("kits").returns(true);
    wrapSpawnStub = sinon.stub(initSpawn, "wrapSpawn").resolves();
    spawnWithOutputStub = sinon
      .stub(initSpawn, "spawnWithOutput")
      .resolves(JSON.stringify([{ hasShrinkwrap: true }]));
    sinon.stub(fs, "ensureDir").resolves();
    sinon.stub(fs, "ensureFileSync");
    sinon.stub(fs, "pathExists").resolves(false);
    sinon.stub(fs, "stat").resolves({ isDirectory: () => true } as fs.Stats);
    sinon.stub(fs, "readJson").resolves({});
    sinon.stub(fs, "writeJson").resolves();
    sinon.stub(fs, "writeFile").resolves();
    fsRemoveStub = sinon.stub(fs, "remove").resolves();
    fsReaddirStub = sinon.stub(fs, "readdir").resolves([]);
    seedKitInstanceEnvStub = sinon.stub(env, "seedKitInstanceEnv");
    loggerInfoStub = sinon.stub(logger, "info");
    loggerWarnStub = sinon.stub(logger, "warn");
    getFirebaseConfigStub = sinon
      .stub(functionsConfig, "getFirebaseConfig")
      .resolves({ projectId: "my-project" });
    discoverBuildStub = sinon.stub().resolves(build.empty());
    getRuntimeDelegateStub = sinon.stub(runtimes, "getRuntimeDelegate").resolves({
      language: "nodejs",
      runtime: supported.latest("nodejs"),
      bin: "node",
      validate: sinon.stub().resolves(),
      build: sinon.stub().resolves(),
      watch: sinon.stub().resolves(() => Promise.resolve()),
      discoverBuild: discoverBuildStub,
    });
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
      return Promise.resolve(val || {});
    });
  }

  describe("generateUniqueId", () => {
    it("should return base ID when it is not in existing IDs", () => {
      const existing = ["other-kit"];
      expect(generateUniqueId("my-kit", existing)).to.equal("my-kit");
    });

    it("should append random 4-character hex suffix when base ID collides", () => {
      const existing = ["my-kit"];
      const res = generateUniqueId("my-kit", existing);
      expect(res).to.match(/^my-kit-[a-f0-9]{4}$/);
      expect(existing.includes(res)).to.be.false;
    });

    it("should truncate long base IDs to ensure total length <= 40", () => {
      const longBase = "a".repeat(40);
      const existing = [longBase];
      const res = generateUniqueId(longBase, existing);
      expect(res.length).to.be.at.most(40);
      expect(res).to.match(/^a{35}-[a-f0-9]{4}$/);
    });
  });

  describe("getUnconfiguredInstancesForProject", () => {
    let hasProjectEnvStub: sinon.SinonStub;

    beforeEach(() => {
      hasProjectEnvStub = sinon.stub(functionsEnv, "hasProjectEnv");
    });

    it("should return all instance IDs when none are configured", () => {
      const mockConfig = { path: (p: string) => `/mock/${p}` };
      const kit = {
        kit: "test-kit",
        source: "function-kits/test-kit",
        instances: {
          inst1: "function-kits/test-kit/config-inst1",
          inst2: "function-kits/test-kit/config-inst2",
        },
      } as unknown as ValidatedKitSingle;
      hasProjectEnvStub.returns(false);

      expect(
        getUnconfiguredInstancesForProject({ config: mockConfig, kit, projectId: "my-proj" }),
      ).to.deep.equal(["inst1", "inst2"]);
    });

    it("should return only unconfigured instance IDs when some are configured", () => {
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
        .withArgs("/mock/function-kits/test-kit/config-inst1", "my-proj", undefined)
        .returns(true);
      hasProjectEnvStub
        .withArgs("/mock/function-kits/test-kit/config-inst2", "my-proj", undefined)
        .returns(false);

      expect(
        getUnconfiguredInstancesForProject({ config: mockConfig, kit, projectId: "my-proj" }),
      ).to.deep.equal(["inst2"]);
    });

    it("should return empty array when all instances are configured", () => {
      const mockConfig = { path: (p: string) => `/mock/${p}` };
      const kit = {
        kit: "test-kit",
        source: "function-kits/test-kit",
        instances: {
          inst1: "function-kits/test-kit/config-inst1",
          inst2: "function-kits/test-kit/config-inst2",
        },
      } as unknown as ValidatedKitSingle;
      hasProjectEnvStub.returns(true);

      expect(
        getUnconfiguredInstancesForProject({ config: mockConfig, kit, projectId: "my-proj" }),
      ).to.deep.equal([]);
    });

    it("should return empty array when kit has no instances", () => {
      const mockConfig = { path: (p: string) => `/mock/${p}` };
      const kit = {
        kit: "test-kit",
        source: "function-kits/test-kit",
        instances: {},
      } as unknown as ValidatedKitSingle;

      expect(
        getUnconfiguredInstancesForProject({ config: mockConfig, kit, projectId: "my-proj" }),
      ).to.deep.equal([]);
    });
  });

  describe("extractExistingFunctionsInfo", () => {
    it("should return empty arrays when configFunctions is undefined or empty", () => {
      const resUndefined = extractExistingFunctionsInfo(undefined);
      expect(resUndefined.existingFunctions).to.deep.equal([]);
      expect(resUndefined.existingKitIds).to.deep.equal([]);
      expect(resUndefined.existingCodebases).to.deep.equal([]);
      expect(resUndefined.existingInstanceIds).to.deep.equal([]);

      const resEmpty = extractExistingFunctionsInfo([]);
      expect(resEmpty.existingFunctions).to.deep.equal([]);
      expect(resEmpty.existingKitIds).to.deep.equal([]);
      expect(resEmpty.existingCodebases).to.deep.equal([]);
      expect(resEmpty.existingInstanceIds).to.deep.equal([]);
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
      expect(res.existingCodebases).to.include("my-codebase");
      expect(res.existingKitIds).to.include("my-kit");
      expect(res.existingInstanceIds).to.include("inst-1");
      expect(res.existingInstanceIds).to.include("inst-2");
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

      addKitToConfig({
        config: mockConfig,
        kitId: "new-kit",
        sourcePackage: { name: "@scope/pkg" },
        sourcePath: "function-kits/new-kit/source",
        predeploy: ['npm --prefix "$RESOURCE_DIR" run build'],
      });

      expect(writtenFiles["firebase.json"]).to.deep.equal({
        functions: [
          {
            kit: "new-kit",
            sourcePackage: { name: "@scope/pkg" },
            source: "function-kits/new-kit/source",
            instances: {},
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

      addKitToConfig({
        config: mockConfig,
        kitId: "new-kit",
        sourcePackage: { name: "@scope/pkg" },
        sourcePath: "function-kits/new-kit/source",
        predeploy: ['npm --prefix "$RESOURCE_DIR" run build'],
      });

      const functions = (writtenFiles["firebase.json"] as { functions: unknown[] }).functions;
      expect(functions).to.have.length(2);
      expect(functions[0]).to.deep.equal(existingEntry);
      expect(functions[1]).to.deep.equal({
        kit: "new-kit",
        sourcePackage: { name: "@scope/pkg" },
        source: "function-kits/new-kit/source",
        instances: {},
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

      addKitToConfig({
        config: mockConfig,
        kitId: "new-kit",
        sourcePackage: { name: "@scope/pkg" },
        sourcePath: "function-kits/new-kit/source",
        predeploy: ['npm --prefix "$RESOURCE_DIR" run build'],
      });

      const functions = (writtenFiles["firebase.json"] as { functions: unknown[] }).functions;
      expect(functions).to.have.length(2);
      expect(functions[0]).to.deep.equal(existingEntry);
    });

    it("should add directory kit without sourcePackage and with predeploy when provided", () => {
      const writtenFiles: Record<string, unknown> = {};
      const mockConfig = {
        src: {},
        writeProjectFile: (file: string, content: unknown) => {
          writtenFiles[file] = content;
        },
      } as unknown as Config;

      addKitToConfig({
        config: mockConfig,
        kitId: "local-kit",
        sourcePath: "my-local-functions",
        predeploy: ['npm --prefix "$RESOURCE_DIR" run build'],
      });

      expect(writtenFiles["firebase.json"]).to.deep.equal({
        functions: [
          {
            kit: "local-kit",
            source: "my-local-functions",
            instances: {},
            predeploy: ['npm --prefix "$RESOURCE_DIR" run build'],
          },
        ],
      });
    });

    it("should add directory kit without predeploy when omitted", () => {
      const writtenFiles: Record<string, unknown> = {};
      const mockConfig = {
        src: {},
        writeProjectFile: (file: string, content: unknown) => {
          writtenFiles[file] = content;
        },
      } as unknown as Config;

      addKitToConfig({
        config: mockConfig,
        kitId: "local-kit",
        sourcePath: "my-local-functions",
      });

      expect(writtenFiles["firebase.json"]).to.deep.equal({
        functions: [
          {
            kit: "local-kit",
            source: "my-local-functions",
            instances: {},
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

      addInstanceToKitConfig({
        config: mockConfig,
        kitId: "my-kit",
        instanceId: "inst2",
        configDirPath: "function-kits/my-kit/config-inst2",
      });

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
        addInstanceToKitConfig({
          config: mockConfig,
          kitId: "missing-kit",
          instanceId: "inst1",
          configDirPath: "config-inst1",
        }),
      ).to.throw(FirebaseError, "Kit 'missing-kit' not found in firebase.json.");
    });
  });

  describe("addInstanceToKit", () => {
    it("should ensure config dir and update config", async () => {
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
      const res = await promptKitInstanceId({
        baseKitId: "my-kit",
        existingInstanceIds: ["other-inst"],
        existingCodebases: ["codebase1"],
        nonInteractive: false,
        customInstanceId: "valid-custom-inst",
      });
      expect(res).to.equal("valid-custom-inst");
    });

    it("should throw if custom instance ID collides with existing instances", async () => {
      await expect(
        promptKitInstanceId({
          baseKitId: "my-kit",
          existingInstanceIds: ["existing-inst"],
          existingCodebases: [],
          nonInteractive: false,
          customInstanceId: "existing-inst",
        }),
      ).to.be.rejectedWith(FirebaseError, /must be unique across all kits/);
    });

    it("should throw if custom instance ID collides with codebase name", async () => {
      await expect(
        promptKitInstanceId({
          baseKitId: "my-kit",
          existingInstanceIds: [],
          existingCodebases: ["existing-codebase"],
          nonInteractive: false,
          customInstanceId: "existing-codebase",
        }),
      ).to.be.rejectedWith(FirebaseError, /must be mutually exclusive/);
    });

    it("should prompt user when custom instance ID is not provided", async () => {
      sinon.stub(prompt, "input").resolves("prompted-inst");
      const res = await promptKitInstanceId({
        baseKitId: "my-kit",
        existingInstanceIds: [],
        existingCodebases: [],
      });
      expect(res).to.equal("prompted-inst");
    });
  });

  describe("promptKitId", () => {
    it("should return custom kit ID directly if provided and valid", async () => {
      const res = await promptKitId({
        baseKitId: "my-pkg",
        existingKitIds: ["other-kit"],
        nonInteractive: false,
        customKitId: "custom-kit-id",
      });
      expect(res).to.equal("custom-kit-id");
    });

    it("should throw if custom kit ID collides with existing kit IDs", async () => {
      await expect(
        promptKitId({
          baseKitId: "my-pkg",
          existingKitIds: ["existing-kit"],
          nonInteractive: false,
          customKitId: "existing-kit",
        }),
      ).to.be.rejectedWith(FirebaseError, /functions.kit must be unique/);
    });

    it("should prompt user when custom kit ID is not provided", async () => {
      sinon.stub(prompt, "input").resolves("prompted-kit");
      const res = await promptKitId({
        baseKitId: "my-pkg",
        existingKitIds: [],
      });
      expect(res).to.equal("prompted-kit");
    });
  });

  describe("promptExistingInstanceForProject", () => {
    it("should throw if kit has no instances configured", async () => {
      const kit = {
        kit: "my-kit",
        instances: {},
      } as unknown as ValidatedKitSingle;

      await expect(
        promptExistingInstanceForProject({ existingKit: kit, unconfiguredInstanceIds: [] }),
      ).to.be.rejectedWith(FirebaseError, /Kit 'my-kit' has no instances configured\./);
    });

    it("should return the instance directly when only one instance exists and log reason", async () => {
      const selectStub = sinon.stub(prompt, "select");
      const logBulletStub = sinon.stub(utils, "logLabeledBullet");
      const kit = {
        kit: "my-kit",
        instances: {
          "inst-1": "function-kits/my-kit/config-inst-1",
        },
      } as unknown as ValidatedKitSingle;

      const res = await promptExistingInstanceForProject({
        existingKit: kit,
        unconfiguredInstanceIds: ["inst-1"],
      });

      expect(res).to.equal("inst-1");
      expect(selectStub).to.not.have.been.called;
      expect(logBulletStub).to.have.been.calledOnceWith(
        "functions",
        `${clc.bold("inst-1")} is the only instance without a configuration. Configuring...`,
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

      const res = await promptExistingInstanceForProject({
        nonInteractive: false,
        existingKit: kit,
        unconfiguredInstanceIds: ["inst-1", "inst-2"],
      });

      expect(res).to.equal("inst-2");
      expect(selectStub).to.have.been.calledOnceWith({
        message: "Which instance would you like to configure for this project?",
        choices: ["inst-1", "inst-2"],
        nonInteractive: false,
      });
    });

    it("should abort in non-interactive mode if multiple unconfigured instances exist", async () => {
      const kit = {
        kit: "my-kit",
        instances: {
          "inst-1": "function-kits/my-kit/config-inst-1",
          "inst-2": "function-kits/my-kit/config-inst-2",
        },
      } as unknown as ValidatedKitSingle;

      await expect(
        promptExistingInstanceForProject({
          nonInteractive: true,
          existingKit: kit,
          unconfiguredInstanceIds: ["inst-1", "inst-2"],
        }),
      ).to.be.rejectedWith(FirebaseError, /cannot be answered in non-interactive mode/);
    });

    it("should return specified instanceId directly if provided in options and valid", async () => {
      const selectStub = sinon.stub(prompt, "select");
      const kit = {
        kit: "my-kit",
        instances: {
          "inst-1": "function-kits/my-kit/config-inst-1",
          "inst-2": "function-kits/my-kit/config-inst-2",
        },
      } as unknown as ValidatedKitSingle;

      const res = await promptExistingInstanceForProject({
        instanceId: "inst-2",
        nonInteractive: true,
        existingKit: kit,
        unconfiguredInstanceIds: ["inst-1", "inst-2"],
      });

      expect(res).to.equal("inst-2");
      expect(selectStub).to.not.have.been.called;
    });

    it("should throw FirebaseError if specified instanceId does not exist in kit", async () => {
      const kit = {
        kit: "my-kit",
        instances: {
          "inst-1": "function-kits/my-kit/config-inst-1",
        },
      } as unknown as ValidatedKitSingle;

      await expect(
        promptExistingInstanceForProject({
          instanceId: "invalid-inst",
          nonInteractive: true,
          existingKit: kit,
          unconfiguredInstanceIds: ["inst-1"],
        }),
      ).to.be.rejectedWith(
        FirebaseError,
        "Instance 'invalid-inst' does not exist in kit 'my-kit'. Available instances: inst-1",
      );
    });

    it("should filter choices to only unconfigured instances when unconfiguredInstanceIds is provided", async () => {
      const selectStub = sinon.stub(prompt, "select").resolves("inst-3");
      const kit = {
        kit: "my-kit",
        instances: {
          "inst-1": "function-kits/my-kit/config-inst-1",
          "inst-2": "function-kits/my-kit/config-inst-2",
          "inst-3": "function-kits/my-kit/config-inst-3",
        },
      } as unknown as ValidatedKitSingle;

      const res = await promptExistingInstanceForProject({
        nonInteractive: false,
        unconfiguredInstanceIds: ["inst-2", "inst-3"],
        existingKit: kit,
      });

      expect(res).to.equal("inst-3");
      expect(selectStub).to.have.been.calledOnceWith({
        message: "Which instance would you like to configure for this project?",
        choices: ["inst-2", "inst-3"],
        nonInteractive: false,
      });
    });

    it("should return single unconfigured instance directly without prompting even if multiple instances exist", async () => {
      const selectStub = sinon.stub(prompt, "select");
      const kit = {
        kit: "my-kit",
        instances: {
          "inst-1": "function-kits/my-kit/config-inst-1",
          "inst-2": "function-kits/my-kit/config-inst-2",
        },
      } as unknown as ValidatedKitSingle;

      const res = await promptExistingInstanceForProject({
        nonInteractive: false,
        unconfiguredInstanceIds: ["inst-2"],
        existingKit: kit,
      });

      expect(res).to.equal("inst-2");
      expect(selectStub).to.not.have.been.called;
    });

    it("should throw FirebaseError if specified instanceId is already configured for this project", async () => {
      const kit = {
        kit: "my-kit",
        instances: {
          "inst-1": "function-kits/my-kit/config-inst-1",
          "inst-2": "function-kits/my-kit/config-inst-2",
        },
      } as unknown as ValidatedKitSingle;

      await expect(
        promptExistingInstanceForProject({
          instanceId: "inst-1",
          nonInteractive: true,
          unconfiguredInstanceIds: ["inst-2"],
          existingKit: kit,
        }),
      ).to.be.rejectedWith(
        FirebaseError,
        "Instance 'inst-1' is already configured for this project.",
      );
    });

    it("should throw FirebaseError if kit has no unconfigured instances for this project", async () => {
      const kit = {
        kit: "my-kit",
        instances: {
          "inst-1": "function-kits/my-kit/config-inst-1",
        },
      } as unknown as ValidatedKitSingle;

      await expect(
        promptExistingInstanceForProject({
          nonInteractive: false,
          unconfiguredInstanceIds: [],
          existingKit: kit,
        }),
      ).to.be.rejectedWith(
        FirebaseError,
        "Kit 'my-kit' has no unconfigured instances for this project.",
      );
    });
  });

  describe("discoverKitBuild", () => {
    it("should pass firebase envs including FIREBASE_KIT_INSTANCE_ID to discoverBuild when instanceId is provided", async () => {
      await discoverKitBuild({
        instanceId: "my-inst",
        projectId: "test-proj",
        absSourcePath: "/mock/source",
      });

      expect(getRuntimeDelegateStub).to.have.been.calledOnceWithExactly({
        projectId: "test-proj",
        sourceDir: "/mock/source",
        projectDir: "",
      });
      expect(discoverBuildStub).to.have.been.calledOnceWithExactly(
        {},
        {
          FIREBASE_CONFIG: JSON.stringify({ projectId: "test-proj" }),
          GCLOUD_PROJECT: "test-proj",
          FIREBASE_KIT_INSTANCE_ID: "my-inst",
        },
      );
    });

    it("should omit FIREBASE_KIT_INSTANCE_ID from discoverBuild envs when instanceId is omitted", async () => {
      await discoverKitBuild({ projectId: "test-proj", absSourcePath: "/mock/source" });

      expect(discoverBuildStub).to.have.been.calledOnceWithExactly(
        {},
        {
          FIREBASE_CONFIG: JSON.stringify({ projectId: "test-proj" }),
          GCLOUD_PROJECT: "test-proj",
        },
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
      discoverBuildStub.resolves(mockBuild);

      await printKitFirstDeployReport({ instanceId: "my-inst", absSourcePath: "/mock/source" });

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
      discoverBuildStub.resolves(mockBuild);

      await printKitFirstDeployReport({ instanceId: "my-inst", absSourcePath: "/mock/source" });

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
      discoverBuildStub.resolves(mockBuild);

      await printKitFirstDeployReport({ instanceId: "my-inst", absSourcePath: "/mock/source" });

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
      discoverBuildStub.resolves(mockBuild);

      await printKitFirstDeployReport({ instanceId: "my-inst", absSourcePath: "/mock/source" });

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
      discoverBuildStub.resolves(mockBuild);
      sinon.stub(iam, "getRoleName").callsFake((role: string) => {
        if (role === "roles/datastore.user") return Promise.resolve("Cloud Datastore User");
        if (role === "roles/bigquery.dataEditor") return Promise.resolve("BigQuery Data Editor");
        return Promise.resolve(role);
      });

      await printKitFirstDeployReport({ instanceId: "my-inst", absSourcePath: "/mock/source" });

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
      discoverBuildStub.resolves(mockBuild);
      sinon.stub(iam, "getRoleName").resolves("BigQuery Data Editor");

      await printKitFirstDeployReport({ instanceId: "my-inst", absSourcePath: "/mock/source" });

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
      discoverBuildStub.resolves(mockBuild);

      await printKitFirstDeployReport({ instanceId: "my-inst", absSourcePath: "/mock/source" });

      expect(loggerInfoStub).to.not.have.been.called;
      expect(loggerWarnStub).to.not.have.been.called;
    });

    it("should handle discovery errors gracefully without throwing", async () => {
      getRuntimeDelegateStub.rejects(new Error("Discovery failed"));

      await expect(
        printKitFirstDeployReport({ instanceId: "my-inst", absSourcePath: "/mock/source" }),
      ).to.not.be.rejected;
    });

    it("should use preDiscoveredBuild when provided without rediscovering build", async () => {
      const mockBuild: build.Build = {
        requiredAPIs: [{ api: "storage.googleapis.com" }],
        endpoints: {},
        params: [],
        requiredRoles: [],
      };

      await printKitFirstDeployReport({
        instanceId: "my-inst",
        absSourcePath: "/mock/source",
        preDiscoveredBuild: mockBuild,
      });

      expect(getRuntimeDelegateStub).to.not.have.been.called;
      expect(loggerInfoStub).to.have.been.calledWith(
        sinon.match(/functions:/),
        sinon.match(
          "At the first deploy, the following APIs will be enabled in your project:\n- storage.googleapis.com",
        ),
      );
    });

    it("should forward runtime to discoverKitBuild when preDiscoveredBuild is not provided", async () => {
      const mockBuild: build.Build = {
        requiredAPIs: [],
        endpoints: {},
        params: [],
        requiredRoles: [],
      };
      discoverBuildStub.resolves(mockBuild);

      await printKitFirstDeployReport({
        instanceId: "my-inst",
        absSourcePath: "/mock/source",
        runtime: "nodejs22",
      });

      expect(getRuntimeDelegateStub).to.have.been.calledOnceWith(
        sinon.match({
          sourceDir: "/mock/source",
          runtime: "nodejs22",
        }),
      );
    });
  });

  describe("promptAndWriteKitParams", () => {
    let loadUserEnvsStub: sinon.SinonStub;
    let writeResolvedParamsStub: sinon.SinonStub;
    let writeResolvedSecretRefsStub: sinon.SinonStub;
    let resolveParamsStub: sinon.SinonStub;

    beforeEach(() => {
      loadUserEnvsStub = sinon.stub(functionsEnv, "loadUserEnvs").returns({});
      writeResolvedParamsStub = sinon.stub(functionsEnv, "writeResolvedParams");
      writeResolvedSecretRefsStub = sinon.stub(functionsEnv, "writeResolvedSecretRefs");
      resolveParamsStub = sinon.stub(params, "resolveParams").resolves({
        paramValues: {},
        secretRefs: {},
      });
    });

    it("should return early if params array is empty or undefined", async () => {
      const mockConfig = { projectDir: "/mock/project" } as Config;
      await promptAndWriteKitParams({
        config: mockConfig,
        projectId: "my-project",
        absConfigDirPath: "/mock/project/config-inst",
        absSourcePath: "/mock/project/source",
        instanceId: "inst",
        params: [],
      });

      expect(loadUserEnvsStub).to.not.have.been.called;
      expect(resolveParamsStub).to.not.have.been.called;
      expect(writeResolvedParamsStub).to.not.have.been.called;
    });

    it("should return early and log debug if projectId is missing", async () => {
      const mockConfig = { projectDir: "/mock/project" } as Config;
      const paramList: params.Param[] = [{ name: "FOO", type: "string" }];

      const debugStub = sinon.stub(logger, "debug");
      await promptAndWriteKitParams({
        config: mockConfig,
        absConfigDirPath: "/mock/project/config-inst",
        absSourcePath: "/mock/project/source",
        instanceId: "inst",
        params: paramList,
      });

      expect(loadUserEnvsStub).to.not.have.been.called;
      expect(resolveParamsStub).to.not.have.been.called;
      expect(debugStub).to.have.been.calledWith(
        "Skipping functions kit parameter prompt: no active project ID.",
      );
    });

    it("should resolve missing params and write them to config dir", async () => {
      const mockConfig = { projectDir: "/mock/project" } as Config;
      const paramList: params.Param[] = [
        { name: "PARAM_STR", type: "string" },
        { name: "PARAM_INT", type: "int" },
      ];

      loadUserEnvsStub.returns({ PARAM_STR: "existing" });
      const resolvedParamValues = {
        PARAM_STR: new params.ParamValue("existing", false, { string: true }),
        PARAM_INT: new params.ParamValue("123", false, { number: true }),
      };
      resolveParamsStub.resolves({
        paramValues: resolvedParamValues,
        secretRefs: {},
      });

      await promptAndWriteKitParams({
        config: mockConfig,
        projectId: "my-project",
        projectAlias: "staging",
        absConfigDirPath: "/mock/project/config-inst",
        absSourcePath: "/mock/project/source",
        instanceId: "inst",
        nonInteractive: false,
        params: paramList,
      });

      expect(loadUserEnvsStub).to.have.been.calledWith({
        configDir: "/mock/project/config-inst",
        functionsSource: "/mock/project/source",
        projectDir: "/mock/project",
        projectId: "my-project",
        projectAlias: "staging",
      });

      expect(resolveParamsStub).to.have.been.calledWith({
        params: paramList,
        firebaseConfig: { projectId: "my-project" },
        userEnvs: sinon.match.object,
        codebase: "inst",
        nonInteractive: false,
      });

      expect(writeResolvedParamsStub).to.have.been.calledWith(
        resolvedParamValues,
        { PARAM_STR: "existing" },
        {
          configDir: "/mock/project/config-inst",
          functionsSource: "/mock/project/source",
          projectDir: "/mock/project",
          projectId: "my-project",
          projectAlias: "staging",
        },
      );
    });

    it("should write secret refs with an instance-specific prefix when secretEnvParams and writeDefaultSecretBindings experiments are enabled", async () => {
      (experiments.isEnabled as sinon.SinonStub).withArgs("secretEnvParams").returns(true);
      (experiments.isEnabled as sinon.SinonStub)
        .withArgs("writeDefaultSecretBindings")
        .returns(true);
      const mockConfig = { projectDir: "/mock/project" } as Config;
      const paramList: params.Param[] = [{ name: "SECRET_VAR", type: "secret" }];
      const wantUpdatedParamList: params.Param[] = [
        { name: "SECRET_VAR", type: "secret", resourceId: "kit-inst-SECRET_VAR" },
      ];

      resolveParamsStub.resolves({
        paramValues: {},
        secretRefs: { SECRET_VAR: "my-secret:latest" },
      });

      await promptAndWriteKitParams({
        config: mockConfig,
        projectId: "my-project",
        absConfigDirPath: "/mock/project/config-inst",
        absSourcePath: "/mock/project/source",
        instanceId: "inst",
        nonInteractive: false,
        params: paramList,
      });

      expect(resolveParamsStub).to.have.been.calledWith({
        params: wantUpdatedParamList,
        firebaseConfig: { projectId: "my-project" },
        userEnvs: sinon.match.object,
        codebase: "inst",
        nonInteractive: false,
      });

      expect(writeResolvedSecretRefsStub).to.have.been.calledWith(
        { SECRET_VAR: "my-secret:latest" },
        {},
        sinon.match.object,
      );
    });

    it("should not write secret refs when writeDefaultSecretBindings experiment is disabled", async () => {
      (experiments.isEnabled as sinon.SinonStub).withArgs("secretEnvParams").returns(true);
      (experiments.isEnabled as sinon.SinonStub)
        .withArgs("writeDefaultSecretBindings")
        .returns(false);
      const mockConfig = { projectDir: "/mock/project" } as Config;
      const paramList: params.Param[] = [{ name: "SECRET_VAR", type: "secret" }];

      resolveParamsStub.resolves({
        paramValues: {},
        secretRefs: { SECRET_VAR: "my-secret:latest" },
      });

      await promptAndWriteKitParams({
        config: mockConfig,
        projectId: "my-project",
        absConfigDirPath: "/mock/project/config-inst",
        absSourcePath: "/mock/project/source",
        instanceId: "inst",
        nonInteractive: false,
        params: paramList,
      });

      expect(writeResolvedSecretRefsStub).to.not.have.been.called;
    });

    it("should not write secret refs when secretEnvParams experiment is disabled even if writeDefaultSecretBindings is enabled", async () => {
      (experiments.isEnabled as sinon.SinonStub).withArgs("secretEnvParams").returns(false);
      (experiments.isEnabled as sinon.SinonStub)
        .withArgs("writeDefaultSecretBindings")
        .returns(true);
      const mockConfig = { projectDir: "/mock/project" } as Config;
      const paramList: params.Param[] = [{ name: "SECRET_VAR", type: "secret" }];

      resolveParamsStub.resolves({
        paramValues: {},
        secretRefs: { SECRET_VAR: "my-secret:latest" },
      });

      await promptAndWriteKitParams({
        config: mockConfig,
        projectId: "my-project",
        absConfigDirPath: "/mock/project/config-inst",
        absSourcePath: "/mock/project/source",
        instanceId: "inst",
        nonInteractive: false,
        params: paramList,
      });

      expect(writeResolvedSecretRefsStub).to.not.have.been.called;
    });

    it("should apply secretRefs from loaded user envs to matching secret params", async () => {
      const mockConfig = { projectDir: "/mock/project" } as Config;
      const secretParam: params.Param = { name: "MY_SECRET", type: "secret" };
      loadUserEnvsStub.returns({
        FIREBASE_SECRET_REF_MY_SECRET: "projects/12345/secrets/my-secret-id/versions/2",
      });

      await promptAndWriteKitParams({
        config: mockConfig,
        projectId: "my-project",
        absConfigDirPath: "/mock/project/config-inst",
        absSourcePath: "/mock/project/source",
        instanceId: "inst",
        params: [secretParam],
      });

      if (secretParam.type === "secret") {
        expect(secretParam.resourceId).to.equal("my-secret-id");
        expect(secretParam.version).to.equal("2");
        expect(secretParam.inLocalEnvironment).to.be.true;
      }
    });

    it("should handle getFirebaseConfig failure gracefully and still resolve params", async () => {
      getFirebaseConfigStub.rejects(new Error("API network error"));
      const mockConfig = { projectDir: "/mock/project" } as Config;
      const paramList: params.Param[] = [{ name: "PARAM_STR", type: "string" }];

      await promptAndWriteKitParams({
        config: mockConfig,
        projectId: "my-project",
        absConfigDirPath: "/mock/project/config-inst",
        absSourcePath: "/mock/project/source",
        instanceId: "inst",
        params: paramList,
      });

      expect(resolveParamsStub).to.have.been.calledWith({
        params: paramList,
        firebaseConfig: { projectId: "my-project" },
        userEnvs: sinon.match.object,
        codebase: "inst",
        nonInteractive: undefined,
      });
    });

    it("should propagate errors thrown by resolveParams", async () => {
      resolveParamsStub.rejects(new FirebaseError("In non-interactive mode but have no value"));
      const mockConfig = { projectDir: "/mock/project" } as Config;
      const paramList: params.Param[] = [{ name: "PARAM_STR", type: "string" }];

      await expect(
        promptAndWriteKitParams({
          config: mockConfig,
          projectId: "my-project",
          absConfigDirPath: "/mock/project/config-inst",
          absSourcePath: "/mock/project/source",
          instanceId: "inst",
          nonInteractive: true,
          params: paramList,
        }),
      ).to.be.rejectedWith(FirebaseError, "In non-interactive mode but have no value");
    });
  });

  describe("resolveOrCreateInstance and configureInstanceForProject (Stages 2 & 3)", () => {
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

      const resolved = await resolveOrCreateInstance({
        config: mockConfig,
        project: "my-project",
        kit: existingKit,
        isNewKit: false,
        existingFunctionsInfo: {
          existingFunctions: [existingKit],
          existingKitIds: ["firestore-bigquery-export"],
          existingCodebases: [],
          existingInstanceIds: ["inst1"],
        },
      });

      expect(resolved).to.deep.equal({
        action: "addedInstance",
        instanceId: "inst2",
        configDirPath: "function-kits/firestore-bigquery-export/config-inst2",
        absConfigDirPath: "/mock/project/function-kits/firestore-bigquery-export/config-inst2",
      });
      expect(existingKit.instances["inst2"]).to.equal(
        "function-kits/firestore-bigquery-export/config-inst2",
      );
    });

    it("should prompt and write params when adding an instance to existing kit with params", async () => {
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
        writeProjectFile: sinon.stub(),
      } as unknown as Config;

      sinon.stub(prompt, "select").resolves("addInstance");
      sinon.stub(prompt, "input").resolves("inst2");

      const paramList: params.Param[] = [{ name: "TABLE_NAME", type: "string" }];
      const mockBuild: build.Build = {
        requiredAPIs: [],
        endpoints: {},
        params: paramList,
      };
      discoverBuildStub.resolves(mockBuild);

      const resolveParamsStub = sinon.stub(params, "resolveParams").resolves({
        paramValues: { TABLE_NAME: new params.ParamValue("my_table", false, { string: true }) },
        secretRefs: {},
      });
      const writeResolvedParamsStub = sinon.stub(functionsEnv, "writeResolvedParams");

      const resolved = await resolveOrCreateInstance({
        config: mockConfig,
        project: "my-project",
        kit: existingKit,
        isNewKit: false,
        existingFunctionsInfo: {
          existingFunctions: [existingKit],
          existingKitIds: ["firestore-bigquery-export"],
          existingCodebases: [],
          existingInstanceIds: ["inst1"],
        },
      });
      await configureInstanceForProject({
        config: mockConfig,
        project: "my-project",
        kit: existingKit,
        ...resolved,
      });

      expect(resolved.action).to.equal("addedInstance");
      expect(discoverBuildStub).to.have.been.calledWith(
        {},
        sinon.match({ FIREBASE_KIT_INSTANCE_ID: "inst2" }),
      );
      expect(resolveParamsStub).to.have.been.calledOnce;
      expect(writeResolvedParamsStub).to.have.been.calledOnce;
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

      const resolved = await resolveOrCreateInstance({
        config: mockConfig,
        project: "my-project",
        kit: existingKit,
        isNewKit: false,
        existingFunctionsInfo: {
          existingFunctions: [existingKit],
          existingKitIds: ["firestore-bigquery-export"],
          existingCodebases: [],
          existingInstanceIds: ["inst1"],
        },
      });

      expect(resolved).to.deep.equal({
        action: "configuredEnv",
        instanceId: "inst1",
        configDirPath: "function-kits/firestore-bigquery-export/config-inst1",
        absConfigDirPath: "/mock/project/function-kits/firestore-bigquery-export/config-inst1",
      });
    });

    it("should seed env for existing instance when seedEnv is provided", async () => {
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

      await configureInstanceForProject({
        config: mockConfig,
        project: "my-project",
        kit: existingKit,
        instanceId: "inst1",
        configDirPath: "function-kits/firestore-bigquery-export/config-inst1",
        absConfigDirPath: "/mock/project/function-kits/firestore-bigquery-export/config-inst1",
        action: "configuredEnv",
        seedEnv: {
          projectId: "my-project",
          envs: {
            FOO: "bar",
          },
        },
      });

      expect(seedKitInstanceEnvStub).to.have.been.calledOnceWith({
        configDir: path.join(
          "/mock/project",
          "function-kits/firestore-bigquery-export/config-inst1",
        ),
        functionsSource: path.join(
          "/mock/project",
          "function-kits/firestore-bigquery-export/source",
        ),
        projectDir: "/mock/project",
        projectId: "my-project",
        projectAlias: undefined,
        envs: {
          FOO: "bar",
        },
      });
    });

    it("should skip parameter prompting when configure is false", async () => {
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

      const resolveParamsStub = sinon.stub(params, "resolveParams");

      await configureInstanceForProject({
        config: mockConfig,
        project: "my-project",
        projectId: "my-project",
        configure: false,
        kit: existingKit,
        instanceId: "inst1",
        configDirPath: "function-kits/firestore-bigquery-export/config-inst1",
        absConfigDirPath: "/mock/project/function-kits/firestore-bigquery-export/config-inst1",
        action: "configuredEnv",
      });

      expect(resolveParamsStub).to.not.have.been.called;
      expect(fs.ensureFileSync).to.have.been.calledWith(
        path.join(
          "/mock/project",
          "function-kits/firestore-bigquery-export/config-inst1",
          ".env.my-project",
        ),
      );
    });

    it("should prompt with only unconfigured instances when some instances are configured and some are unconfigured", async () => {
      const hasProjectEnvStub = sinon.stub(functionsEnv, "hasProjectEnv");
      hasProjectEnvStub
        .withArgs(
          path.join("/mock/project", "function-kits/firestore-bigquery-export/config-inst1"),
          "my-project",
          undefined,
        )
        .returns(true);
      hasProjectEnvStub
        .withArgs(
          path.join("/mock/project", "function-kits/firestore-bigquery-export/config-inst2"),
          "my-project",
          undefined,
        )
        .returns(false);

      const existingKit: ValidatedKitSingle = {
        kit: "firestore-bigquery-export",
        sourcePackage: { name: "@firebase-function-kits/firestore-bigquery-export" },
        source: "function-kits/firestore-bigquery-export/source",
        instances: {
          inst1: "function-kits/firestore-bigquery-export/config-inst1",
          inst2: "function-kits/firestore-bigquery-export/config-inst2",
        },
      };
      const mockConfig = {
        projectDir: "/mock/project",
        src: { functions: [existingKit] },
        path: (p: string) => path.join("/mock/project", p),
      } as unknown as Config;

      const selectStub = sinon.stub(prompt, "select").resolves("addEnv");

      const resolved = await resolveOrCreateInstance({
        config: mockConfig,
        project: "my-project",
        kit: existingKit,
        isNewKit: false,
        existingFunctionsInfo: {
          existingFunctions: [existingKit],
          existingKitIds: ["firestore-bigquery-export"],
          existingCodebases: [],
          existingInstanceIds: ["inst1", "inst2"],
        },
      });

      expect(selectStub).to.have.been.calledOnceWith({
        message:
          "The following instances already exist, but are not configured for this project: inst2. What would you like to do?",
        choices: [
          {
            name: "Add an instance to the existing kit",
            value: "addInstance",
          },
          {
            name: "Configure an existing instance for this project",
            value: "addEnv",
          },
        ],
      });
      expect(resolved).to.deep.equal({
        action: "configuredEnv",
        instanceId: "inst2",
        configDirPath: "function-kits/firestore-bigquery-export/config-inst2",
        absConfigDirPath: "/mock/project/function-kits/firestore-bigquery-export/config-inst2",
      });
    });

    it("should automatically add instance without prompt when all instances are already configured for this project", async () => {
      sinon.stub(functionsEnv, "hasProjectEnv").returns(true);
      const existingKit: ValidatedKitSingle = {
        kit: "firestore-bigquery-export",
        sourcePackage: { name: "@firebase-function-kits/firestore-bigquery-export" },
        source: "function-kits/firestore-bigquery-export/source",
        instances: {
          inst1: "function-kits/firestore-bigquery-export/config-inst1",
          inst2: "function-kits/firestore-bigquery-export/config-inst2",
        },
      };
      const mockConfig = {
        projectDir: "/mock/project",
        src: { functions: [existingKit] },
        path: (p: string) => path.join("/mock/project", p),
        writeProjectFile: sinon.stub(),
      } as unknown as Config;

      const selectStub = sinon.stub(prompt, "select");
      sinon.stub(prompt, "input").resolves("inst3");

      const resolved = await resolveOrCreateInstance({
        config: mockConfig,
        project: "my-project",
        kit: existingKit,
        isNewKit: false,
        existingFunctionsInfo: {
          existingFunctions: [existingKit],
          existingKitIds: ["firestore-bigquery-export"],
          existingCodebases: [],
          existingInstanceIds: ["inst1", "inst2"],
        },
      });

      expect(selectStub).to.not.have.been.called;
      expect(resolved.action).to.equal("addedInstance");
      expect(resolved.instanceId).to.equal("inst3");
    });

    it("should throw FirebaseError when specified instanceId is already configured for this project", async () => {
      const hasProjectEnvStub = sinon.stub(functionsEnv, "hasProjectEnv");
      hasProjectEnvStub
        .withArgs(
          path.join("/mock/project", "function-kits/firestore-bigquery-export/config-inst1"),
          "my-project",
          undefined,
        )
        .returns(true);

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

      await expect(
        resolveOrCreateInstance({
          config: mockConfig,
          project: "my-project",
          instanceId: "inst1",
          kit: existingKit,
          isNewKit: false,
          existingFunctionsInfo: {
            existingFunctions: [existingKit],
            existingKitIds: ["firestore-bigquery-export"],
            existingCodebases: [],
            existingInstanceIds: ["inst1"],
          },
        }),
      ).to.be.rejectedWith(
        FirebaseError,
        "Instance 'inst1' is already configured for this project.",
      );
    });

    it("should throw FirebaseError when specified instanceId collides with an existing instance in another kit", async () => {
      sinon.stub(functionsEnv, "hasProjectEnv").returns(false);
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

      await expect(
        resolveOrCreateInstance({
          config: mockConfig,
          project: "my-project",
          instanceId: "other-kit-inst",
          kit: existingKit,
          isNewKit: false,
          existingFunctionsInfo: {
            existingFunctions: [existingKit],
            existingKitIds: ["firestore-bigquery-export", "other-kit"],
            existingCodebases: [],
            existingInstanceIds: ["inst1", "other-kit-inst"],
          },
        }),
      ).to.be.rejectedWith(
        FirebaseError,
        "functions kit instance ID must be unique across all kits, but 'other-kit-inst' was used more than once.",
      );
    });
  });

  describe("installKitOrInstance", () => {
    beforeEach(() => {
      mockFs({
        "/mock/project/function-kits/firestore-bigquery-export/source/package-lock.json": {
          packages: {
            "node_modules/@firebase-function-kits/firestore-bigquery-export": {
              peerDependencies: {
                "firebase-functions": "^7.0.0",
              },
            },
            "node_modules/firebase-functions": { version: "7.3.2" },
          },
        },
        "/mock/project/function-kits/custom-kit/source/package-lock.json": {
          packages: {
            "node_modules/@firebase-function-kits/firestore-bigquery-export": {
              peerDependencies: {
                "firebase-functions": "^7.0.0",
              },
            },
            "node_modules/firebase-functions": { version: "7.3.2" },
          },
        },
      });
    });

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

    it("should throw an error before prompting or scaffolding if package does not exist in npm registry", async () => {
      const writeProjectFileStub = sinon.stub();
      const askWriteProjectFileStub = sinon.stub().resolves();
      const mockConfig = {
        projectDir: "/mock/project",
        src: { functions: [] },
        path: (p: string) => path.join("/mock/project", p),
        writeProjectFile: writeProjectFileStub,
        askWriteProjectFile: askWriteProjectFileStub,
      } as unknown as Config;

      spawnWithOutputStub
        .withArgs("npm", ["view", "@firebase/my-silly-package", "version"])
        .rejects(new Error("npm error code E404"));

      await expect(
        installKitOrInstance({
          config: mockConfig,
          package: "@firebase/my-silly-package",
        }),
      ).to.be.rejectedWith(
        FirebaseError,
        /NPM package '@firebase\/my-silly-package' could not be found in the npm registry/,
      );

      expect(loggerWarnStub).to.not.have.been.called;
      expect(askWriteProjectFileStub).to.not.have.been.called;
      expect(writeProjectFileStub).to.not.have.been.called;
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

      expect(wrapSpawnStub).to.have.been.calledThrice;
      expect(wrapSpawnStub.firstCall).to.have.been.calledWith(
        "npm",
        ["install", "@firebase-function-kits/firestore-bigquery-export@1.0.0", "--save-prefix=^"],
        "/mock/project/function-kits/firestore-bigquery-export/source",
      );
      expect(wrapSpawnStub.secondCall).to.have.been.calledWith(
        "npm",
        ["install", "firebase-functions@^7.3.2", "--save-prefix=^"],
        "/mock/project/function-kits/firestore-bigquery-export/source",
      );
      expect(wrapSpawnStub.thirdCall).to.have.been.calledWith(
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

      const tsconfig = JSON.parse(
        writtenFiles["function-kits/firestore-bigquery-export/source/tsconfig.json"] as string,
      ) as { compilerOptions?: { skipLibCheck?: boolean } };
      expect(tsconfig.compilerOptions?.skipLibCheck).to.be.true;
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

    it("should accept defaultInstanceId as suggested instance ID for package kit", async () => {
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
        defaultInstanceId: "my-extension-inst",
        nonInteractive: true,
      });

      expect(res).to.deep.equal({
        action: "installedKit",
        kitId: "firestore-bigquery-export",
        instanceId: "my-extension-inst",
        sourcePath: "function-kits/firestore-bigquery-export/source",
        configDirPath: "function-kits/firestore-bigquery-export/config-my-extension-inst",
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

    it("should discover kit build and prompt/write params during kit installation", async () => {
      const mockConfig = {
        projectDir: "/mock/project",
        src: { functions: [] },
        path: (p: string) => path.join("/mock/project", p),
        writeProjectFile: sinon.stub(),
        askWriteProjectFile: sinon.stub().resolves(),
      } as unknown as Config;

      const paramList: params.Param[] = [{ name: "DATASET_NAME", type: "string" }];
      const mockBuild: build.Build = {
        requiredAPIs: [],
        endpoints: {},
        params: paramList,
      };
      discoverBuildStub.resolves(mockBuild);

      const resolveParamsStub = sinon.stub(params, "resolveParams").resolves({
        paramValues: {
          DATASET_NAME: new params.ParamValue("dataset_1", false, { string: true }),
        },
        secretRefs: {},
      });
      const writeResolvedParamsStub = sinon.stub(functionsEnv, "writeResolvedParams");

      const res = await installKitOrInstance({
        config: mockConfig,
        package: "@firebase-function-kits/firestore-bigquery-export@1.0.0",
        nonInteractive: true,
        projectId: "target-proj",
      });

      expect(res.action).to.equal("installedKit");
      expect(resolveParamsStub).to.have.been.calledOnce;
      expect(writeResolvedParamsStub).to.have.been.calledOnce;
    });

    it("should propagate non-interactive error when missing required params without values during kit installation", async () => {
      const mockConfig = {
        projectDir: "/mock/project",
        src: { functions: [] },
        path: (p: string) => path.join("/mock/project", p),
        writeProjectFile: sinon.stub(),
        askWriteProjectFile: sinon.stub().resolves(),
      } as unknown as Config;

      const paramList: params.Param[] = [{ name: "REQUIRED_PARAM", type: "string" }];
      const mockBuild: build.Build = {
        requiredAPIs: [],
        endpoints: {},
        params: paramList,
      };
      discoverBuildStub.resolves(mockBuild);

      sinon
        .stub(params, "resolveParams")
        .rejects(
          new FirebaseError(
            "In non-interactive mode but have no value for the following environment variables: REQUIRED_PARAM",
          ),
        );

      await expect(
        installKitOrInstance({
          config: mockConfig,
          package: "@firebase-function-kits/firestore-bigquery-export@1.0.0",
          nonInteractive: true,
          projectId: "target-proj",
        }),
      ).to.be.rejectedWith(
        FirebaseError,
        "In non-interactive mode but have no value for the following environment variables: REQUIRED_PARAM",
      );
    });

    it("should skip parameter prompting and touch .env.projectId when configure is false", async () => {
      const mockConfig = {
        projectDir: "/mock/project",
        src: { functions: [] },
        path: (p: string) => path.join("/mock/project", p),
        writeProjectFile: sinon.stub(),
        askWriteProjectFile: sinon.stub().resolves(),
      } as unknown as Config;

      const resolveParamsStub = sinon.stub(params, "resolveParams");

      const res = await installKitOrInstance({
        config: mockConfig,
        package: "@firebase-function-kits/firestore-bigquery-export@1.0.0",
        nonInteractive: true,
        projectId: "target-proj",
        configure: false,
      });

      expect(res.action).to.equal("installedKit");
      expect(resolveParamsStub).to.not.have.been.called;
      expect(fs.ensureFileSync).to.have.been.calledWith(
        path.join(
          "/mock/project",
          "function-kits/firestore-bigquery-export/config-firestore-bigquery-export",
          ".env.target-proj",
        ),
      );
    });

    it("should cancel installation for a third-party kit in non-interactive mode when force is not set", async () => {
      const mockConfig = {
        projectDir: "/mock/project",
        src: { functions: [] },
        path: (p: string) => path.join("/mock/project", p),
      } as unknown as Config;

      await expect(
        installKitOrInstance({
          config: mockConfig,
          package: "@third-party/custom-kit",
          nonInteractive: true,
        }),
      ).to.be.rejectedWith(FirebaseError, "Installation cancelled.");
    });

    it("should successfully install a third-party kit without shrinkwrap when force is true", async () => {
      mockFs({
        "/mock/project/function-kits/custom-kit/source/package-lock.json": {
          packages: {
            "node_modules/@third-party/custom-kit": {
              peerDependencies: {
                "firebase-functions": "^7.0.0",
              },
            },
            "node_modules/firebase-functions": { version: "7.3.2" },
          },
        },
      });
      spawnWithOutputStub.resolves(JSON.stringify([{ files: [{ path: "package.json" }] }]));
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
        package: "@third-party/custom-kit@1.0.0",
        nonInteractive: true,
        force: true,
      });

      expect(res).to.deep.equal({
        action: "installedKit",
        kitId: "custom-kit",
        instanceId: "custom-kit",
        sourcePath: "function-kits/custom-kit/source",
        configDirPath: "function-kits/custom-kit/config-custom-kit",
      });

      expect(wrapSpawnStub).to.have.been.calledThrice;
      expect(wrapSpawnStub.firstCall).to.have.been.calledWith(
        "npm",
        ["install", "@third-party/custom-kit@1.0.0", "--save-prefix=^", "--ignore-scripts"],
        "/mock/project/function-kits/custom-kit/source",
      );
      expect(wrapSpawnStub.secondCall).to.have.been.calledWith(
        "npm",
        ["install", "firebase-functions@^7.3.2", "--save-prefix=^", "--ignore-scripts"],
        "/mock/project/function-kits/custom-kit/source",
      );
      expect(wrapSpawnStub.thirdCall).to.have.been.calledWith(
        "npm",
        ["run", "build"],
        "/mock/project/function-kits/custom-kit/source",
      );
    });

    it("should clean up package kit directory and revert config if npm install fails", async () => {
      const mockConfig = {
        projectDir: "/mock/project",
        src: { functions: [] },
        path: (p: string) => path.join("/mock/project", p),
        writeProjectFile: sinon.stub(),
        askWriteProjectFile: sinon.stub().resolves(),
      } as unknown as Config;

      wrapSpawnStub.rejects(new Error("npm ERR! code ENOTFOUND"));

      await expect(
        installKitOrInstance({
          config: mockConfig,
          package: "@firebase-function-kits/firestore-bigquery-export@1.0.0",
          nonInteractive: true,
        }),
      ).to.be.rejectedWith(FirebaseError, /NPM install failed/);

      expect(fsRemoveStub).to.have.been.calledWith(
        path.join("/mock/project", "function-kits/firestore-bigquery-export"),
      );
    });

    it("should clean up package kit directory and empty function-kits dir if param resolution fails", async () => {
      const mockConfig = {
        projectDir: "/mock/project",
        src: { functions: [] },
        path: (p: string) => path.join("/mock/project", p),
        writeProjectFile: sinon.stub(),
        askWriteProjectFile: sinon.stub().resolves(),
      } as unknown as Config;

      const paramList: params.Param[] = [{ name: "DATASET_NAME", type: "string" }];
      const mockBuild: build.Build = {
        requiredAPIs: [],
        endpoints: {},
        params: paramList,
      };
      discoverBuildStub.resolves(mockBuild);
      sinon.stub(params, "resolveParams").rejects(new FirebaseError("Failed to resolve param"));

      (fs.pathExists as sinon.SinonStub)
        .withArgs(path.join("/mock/project", "function-kits"))
        .resolves(true);
      fsReaddirStub.withArgs(path.join("/mock/project", "function-kits")).resolves([]);

      await expect(
        installKitOrInstance({
          config: mockConfig,
          package: "@firebase-function-kits/firestore-bigquery-export@1.0.0",
          nonInteractive: true,
          projectId: "target-proj",
        }),
      ).to.be.rejectedWith(FirebaseError, "Failed to resolve param");

      expect(fsRemoveStub).to.have.been.calledWith(
        path.join("/mock/project", "function-kits/firestore-bigquery-export"),
      );
      expect(fsRemoveStub).to.have.been.calledWith(path.join("/mock/project", "function-kits"));
    });

    it("should not create config dir or delete user source when directory kit npm install fails", async () => {
      const mockConfig = {
        projectDir: "/mock/project",
        src: { functions: [] },
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
        .resolves({ scripts: { build: "tsc" } });

      wrapSpawnStub.rejects(new Error("Build compilation error"));

      await expect(
        installKitOrInstance({
          config: mockConfig,
          directory: "./my-functions",
          nonInteractive: true,
        }),
      ).to.be.rejectedWith(FirebaseError, /NPM install failed/);

      expect(fs.ensureDir).to.not.have.been.called;
      expect(fsRemoveStub).to.not.have.been.calledWith("/mock/project/my-functions");
    });

    it("should clean up directory kit config directory without deleting user source when param resolution fails", async () => {
      const mockConfig = {
        projectDir: "/mock/project",
        src: { functions: [] },
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
        .resolves({ scripts: { build: "tsc" } });

      discoverBuildStub.resolves({
        requiredAPIs: [],
        endpoints: {},
        params: [{ name: "DATASET_NAME", type: "string" }],
      });
      sinon.stub(params, "resolveParams").rejects(new FirebaseError("Failed to resolve param"));

      await expect(
        installKitOrInstance({
          config: mockConfig,
          directory: "./my-functions",
          nonInteractive: true,
          projectId: "target-proj",
        }),
      ).to.be.rejectedWith(FirebaseError, "Failed to resolve param");

      expect(fsRemoveStub).to.have.been.calledWith(
        path.join("/mock/project", "function-kits/my-functions/config-my-functions"),
      );
      expect(fsRemoveStub).to.not.have.been.calledWith("/mock/project/my-functions");
    });

    it("should revert firebase.json if modified before a failure in installKitOrInstance", async () => {
      const initialFunctions = [
        {
          codebase: "default",
          source: "functions",
        },
      ];
      const writtenSnapshots: string[] = [];
      const mockConfig = {
        projectDir: "/mock/project",
        src: { functions: [...initialFunctions] },
        path: (p: string) => path.join("/mock/project", p),
        writeProjectFile: sinon.stub().callsFake((_file: string, content: unknown) => {
          writtenSnapshots.push(JSON.stringify(content));
        }),
        askWriteProjectFile: sinon.stub().resolves(),
      } as unknown as Config;

      const mockBuild: build.Build = {
        requiredAPIs: [],
        endpoints: {},
        params: [],
        requiredRoles: ["roles/viewer"],
      };
      discoverBuildStub.resolves(mockBuild);
      sinon.stub(iam, "getRoleName").rejects(new Error("Reporting error"));

      await expect(
        installKitOrInstance({
          config: mockConfig,
          package: "@firebase-function-kits/firestore-bigquery-export@1.0.0",
          nonInteractive: true,
          configure: true,
        }),
      ).to.be.rejectedWith("Reporting error");

      expect(mockConfig.src.functions).to.deep.equal(initialFunctions);
      expect(writtenSnapshots).to.not.be.empty;
      expect(JSON.parse(writtenSnapshots[writtenSnapshots.length - 1])).to.deep.equal({
        functions: initialFunctions,
      });
    });
  });

  describe("existing kit cleanup on failure in installKitOrInstance", () => {
    it("should clean up instance config dir and revert firebase.json if addInstance fails during params prompt", async () => {
      const existingKit: ValidatedKitSingle = {
        kit: "firestore-bigquery-export",
        sourcePackage: { name: "@firebase-function-kits/firestore-bigquery-export" },
        source: "function-kits/firestore-bigquery-export/source",
        instances: {
          inst1: "function-kits/firestore-bigquery-export/config-inst1",
        },
      };
      const writtenSnapshots: string[] = [];
      const writeProjectFileStub = sinon.stub().callsFake((_file: string, content: unknown) => {
        writtenSnapshots.push(JSON.stringify(content));
      });
      const mockConfig = {
        projectDir: "/mock/project",
        src: { functions: [existingKit] },
        path: (p: string) => path.join("/mock/project", p),
        writeProjectFile: writeProjectFileStub,
        askWriteProjectFile: sinon.stub().resolves(),
      } as unknown as Config;

      const paramList: params.Param[] = [{ name: "PARAM_A", type: "string" }];
      const mockBuild: build.Build = {
        requiredAPIs: [],
        endpoints: {},
        params: paramList,
      };
      discoverBuildStub.resolves(mockBuild);
      sinon.stub(params, "resolveParams").rejects(new FirebaseError("Required param missing"));

      await expect(
        installKitOrInstance({
          config: mockConfig,
          package: "@firebase-function-kits/firestore-bigquery-export",
          instanceId: "inst2",
          nonInteractive: true,
          projectId: "my-project",
        }),
      ).to.be.rejectedWith(FirebaseError, "Required param missing");

      expect(fsRemoveStub).to.have.been.calledWith(
        path.join("/mock/project", "function-kits/firestore-bigquery-export/config-inst2"),
      );
      expect((mockConfig.src.functions as ValidatedKitSingle[])[0].instances).to.deep.equal({
        inst1: "function-kits/firestore-bigquery-export/config-inst1",
      });
      expect(writtenSnapshots).to.not.be.empty;
      const lastWritten = JSON.parse(writtenSnapshots[writtenSnapshots.length - 1]) as {
        functions: ValidatedKitSingle[];
      };
      expect(lastWritten.functions[0].instances).to.deep.equal({
        inst1: "function-kits/firestore-bigquery-export/config-inst1",
      });
    });

    it("should clean up created project env file if addEnv fails during params prompt", async () => {
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

      (fs.pathExists as sinon.SinonStub)
        .withArgs(
          path.join(
            "/mock/project",
            "function-kits/firestore-bigquery-export/config-inst1/.env.my-project",
          ),
        )
        .resolves(false);

      const paramList: params.Param[] = [{ name: "PARAM_A", type: "string" }];
      const mockBuild: build.Build = {
        requiredAPIs: [],
        endpoints: {},
        params: paramList,
      };
      discoverBuildStub.resolves(mockBuild);
      sinon.stub(params, "resolveParams").rejects(new FirebaseError("Required param missing"));

      await expect(
        installKitOrInstance({
          config: mockConfig,
          package: "@firebase-function-kits/firestore-bigquery-export",
          instanceId: "inst1",
          nonInteractive: true,
          projectId: "my-project",
        }),
      ).to.be.rejectedWith(FirebaseError, "Required param missing");

      expect(fsRemoveStub).to.have.been.calledWith(
        path.join(
          "/mock/project",
          "function-kits/firestore-bigquery-export/config-inst1/.env.my-project",
        ),
      );
    });
  });

  describe("revertFunctionsConfig", () => {
    it("should revert functions and save when config was modified", () => {
      const originalFunctions = [{ codebase: "default", source: "functions" }];
      const writeProjectFileStub = sinon.stub();
      const mockConfig = {
        src: {
          functions: [{ kit: "new-kit", source: "function-kits/new-kit" }],
        },
        writeProjectFile: writeProjectFileStub,
      } as unknown as Config;

      revertFunctionsConfig({ config: mockConfig, originalFunctions });

      expect(mockConfig.src.functions).to.deep.equal(originalFunctions);
      expect(writeProjectFileStub).to.have.been.calledOnceWith("firebase.json", mockConfig.src);
    });

    it("should delete functions and save when originally undefined", () => {
      const writeProjectFileStub = sinon.stub();
      const mockConfig = {
        src: {
          functions: [{ kit: "new-kit", source: "function-kits/new-kit" }],
        },
        writeProjectFile: writeProjectFileStub,
      } as unknown as Config;

      revertFunctionsConfig({ config: mockConfig, originalFunctions: undefined });

      expect(mockConfig.src.functions).to.be.undefined;
      expect("functions" in mockConfig.src).to.be.false;
      expect(writeProjectFileStub).to.have.been.calledOnceWith("firebase.json", mockConfig.src);
    });

    it("should do nothing when config was not modified", () => {
      const originalFunctions = [{ codebase: "default", source: "functions" }];
      const writeProjectFileStub = sinon.stub();
      const mockConfig = {
        src: {
          functions: [{ codebase: "default", source: "functions" }],
        },
        writeProjectFile: writeProjectFileStub,
      } as unknown as Config;

      revertFunctionsConfig({ config: mockConfig, originalFunctions });

      expect(writeProjectFileStub).to.not.have.been.called;
    });
  });
});
