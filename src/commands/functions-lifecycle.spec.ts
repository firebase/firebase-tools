import { expect } from "chai";
import * as sinon from "sinon";
import { logger } from "../logger";
import { loadCodebaseBuild } from "./functions-lifecycle-list";
import * as prepare from "../deploy/functions/prepare";
import * as projectUtils from "../projectUtils";
import * as adminSdkConfig from "../emulator/adminSdkConfig";
import * as backend from "../deploy/functions/backend";
import * as lifecycle from "../deploy/functions/release/lifecycle";
import { FirebaseError } from "../error";
import { Options } from "../options";
import * as requirePermissions from "../requirePermissions";
import * as experiments from "../experiments";
import * as ensureApiEnabled from "../ensureApiEnabled";

describe("functions:lifecycle commands", () => {
  let sandbox: sinon.SinonSandbox;
  let options: any;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    options = {
      projectId: "test-project",
      config: {
        src: {
          functions: [{ codebase: "my-codebase", source: "functions" }],
        },
        path: (p: string) => p,
        projectDir: "/path/to/project",
      },
    } as any as Options;

    sandbox.stub(projectUtils, "needProjectId").returns("test-project");
    sandbox.stub(adminSdkConfig, "getProjectAdminSdkConfigOrCached").resolves({
      projectId: "test-project",
      storageBucket: "test-bucket",
    });
  });

  afterEach(() => {
    experiments.setEnabled("kits", null);
    sandbox.restore();
  });

  describe("loadCodebaseBuild", () => {
    it("should throw FirebaseError if codebase is not defined in firebase.json", async () => {
      await expect(loadCodebaseBuild("non-existent", options)).to.be.rejectedWith(
        FirebaseError,
        "No functions config found for codebase or kit instance non-existent",
      );
    });

    it("should load codebase build successfully", async () => {
      const mockBuild = {
        requiredAPIs: [],
        endpoints: {},
        params: [],
        lifecycleHooks: {
          afterFirstDeploy: {
            task: {
              function: "myTask",
            },
          },
        },
      };
      const loadCodebasesStub = sandbox.stub(prepare, "loadCodebases").resolves({
        "my-codebase": mockBuild,
      });

      const build = await loadCodebaseBuild("my-codebase", options);
      expect(build).to.deep.equal(mockBuild);
      expect(loadCodebasesStub).to.have.been.calledOnceWithExactly(
        sinon.match.array,
        options,
        sinon.match.object,
        sinon.match.object,
        [{ codebase: "my-codebase" }],
      );
    });

    it("should load function kit instance build without checking runtime config", async () => {
      experiments.setEnabled("kits", true);
      options.config.src.functions = [
        { codebase: "my-codebase", source: "functions" },
        {
          kit: "my-kit",
          source: "kits/my-kit",
          instances: {
            inst1: "configs/inst1",
          },
        },
      ];
      const mockBuild = {
        requiredAPIs: [],
        endpoints: {},
        params: [],
        lifecycleHooks: {
          afterFirstDeploy: {
            task: {
              function: "kit-inst1-myTask",
            },
          },
        },
      };
      const ensureCheckStub = sandbox.stub(ensureApiEnabled, "check");
      const loadCodebasesStub = sandbox.stub(prepare, "loadCodebases").resolves({
        inst1: mockBuild,
      });

      const build = await loadCodebaseBuild("inst1", options);
      expect(build).to.deep.equal(mockBuild);
      expect(ensureCheckStub).to.not.have.been.called;
      expect(loadCodebasesStub).to.have.been.calledOnceWithExactly(
        sinon.match.array,
        options,
        sinon.match.object,
        sinon.match.object,
        [{ codebase: "inst1" }],
      );
    });
  });

  describe("executeHook", () => {
    it("should throw FirebaseError for non-task hook", async () => {
      const hook: backend.LifecycleHook = {
        call: {
          function: "myCall",
        },
      };
      const mockBackend = backend.empty();

      await expect(lifecycle.executeHook("afterFirstDeploy", hook, mockBackend)).to.be.rejectedWith(
        FirebaseError,
        'Lifecycle hook action type "call" is not supported.',
      );
    });
  });

  describe("CLI Commands", () => {
    let loadCodebaseBuildStub: sinon.SinonStub;

    beforeEach(() => {
      // Stub Command.prototype.prepare to avoid framework-level setup (like project root detection)
      const { Command } = require("../command");
      sandbox.stub(Command.prototype, "prepare").resolves();

      // Stub requirePermissions to avoid network calls
      sandbox.stub(requirePermissions, "requirePermissions").resolves();

      // Stub loadCodebaseBuild to avoid loading actual codebases in command tests
      const listModule = require("./functions-lifecycle-list");
      loadCodebaseBuildStub = sandbox.stub(listModule, "loadCodebaseBuild");
    });

    describe("functions:lifecycle:list", () => {
      it("should list hooks if configured", async () => {
        const loggerStub = sandbox.stub(logger, "info");
        const mockBuild = {
          lifecycleHooks: {
            afterFirstDeploy: {
              task: {
                function: "myTask",
                body: { foo: "bar" },
              },
            },
          },
        };
        loadCodebaseBuildStub.resolves(mockBuild);

        const { command: listCommand } = require("./functions-lifecycle-list");
        await listCommand.runner()("my-codebase", options);

        expect(loggerStub).to.have.been.calledWith(sinon.match("Event: afterFirstDeploy"));
        expect(loggerStub).to.have.been.calledWith(sinon.match("Action: Task"));
        expect(loggerStub).to.have.been.calledWith(sinon.match("Target Function: myTask"));
      });

      it("should log message if no hooks configured", async () => {
        const loggerStub = sandbox.stub(logger, "info");
        loadCodebaseBuildStub.resolves({ lifecycleHooks: {} });

        const { command: listCommand } = require("./functions-lifecycle-list");
        await listCommand.runner()("my-codebase", options);

        expect(loggerStub).to.have.been.calledWith(
          'No lifecycle hooks configured for codebase "my-codebase".',
        );
      });
    });

    describe("functions:lifecycle:run", () => {
      it("should throw error for invalid hook name", async () => {
        const { command: runCommand } = require("./functions-lifecycle-run");
        await expect(runCommand.runner()("invalidHook", "my-codebase", options)).to.be.rejectedWith(
          FirebaseError,
          'Invalid hook name "invalidHook". Supported hooks are "afterFirstDeploy" and "afterRedeploy".',
        );
      });

      it("should throw error if hook is not configured", async () => {
        loadCodebaseBuildStub.resolves({ lifecycleHooks: {} });

        const { command: runCommand } = require("./functions-lifecycle-run");
        await expect(
          runCommand.runner()("afterFirstDeploy", "my-codebase", options),
        ).to.be.rejectedWith(
          FirebaseError,
          'No lifecycle hook "afterFirstDeploy" configured for codebase "my-codebase".',
        );
      });

      it("should execute hook successfully", async () => {
        const mockHook = { task: { function: "myTask" } };
        loadCodebaseBuildStub.resolves({
          lifecycleHooks: {
            afterFirstDeploy: mockHook,
          },
        });

        const mockExistingBackend = backend.empty();
        sandbox.stub(backend, "existingBackend").resolves(mockExistingBackend);
        const executeHookStub = sandbox.stub(lifecycle, "executeHook").resolves();

        const { command: runCommand } = require("./functions-lifecycle-run");
        await runCommand.runner()("afterFirstDeploy", "my-codebase", options);

        expect(executeHookStub).to.have.been.calledWith(
          "afterFirstDeploy",
          mockHook,
          mockExistingBackend,
        );
      });
    });
  });
});
