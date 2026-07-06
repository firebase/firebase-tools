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
    sandbox.restore();
  });

  describe("loadCodebaseBuild", () => {
    it("should throw FirebaseError if codebase is not defined in firebase.json", async () => {
      await expect(loadCodebaseBuild("non-existent", options)).to.be.rejectedWith(
        FirebaseError,
        'Codebase "non-existent" is not defined in firebase.json.',
      );
    });

    it("should load codebase build successfully", async () => {
      const mockBuild = {
        requiredAPIs: [],
        endpoints: {},
        params: [],
        lifecycleHooks: {
          afterInstall: {
            task: {
              function: "myTask",
            },
          },
        },
      };
      sandbox.stub(prepare, "loadCodebases").resolves({
        "my-codebase": mockBuild,
      });

      const build = await loadCodebaseBuild("my-codebase", options);
      expect(build).to.deep.equal(mockBuild);
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

      await expect(lifecycle.executeHook("afterInstall", hook, mockBackend)).to.be.rejectedWith(
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
            afterInstall: {
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

        expect(loggerStub).to.have.been.calledWith(sinon.match("Event: afterInstall"));
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
          'Invalid hook name "invalidHook". Supported hooks are "afterInstall" and "afterUpdate".',
        );
      });

      it("should throw error if hook is not configured", async () => {
        loadCodebaseBuildStub.resolves({ lifecycleHooks: {} });

        const { command: runCommand } = require("./functions-lifecycle-run");
        await expect(
          runCommand.runner()("afterInstall", "my-codebase", options),
        ).to.be.rejectedWith(
          FirebaseError,
          'No lifecycle hook "afterInstall" configured for codebase "my-codebase".',
        );
      });

      it("should execute hook successfully", async () => {
        const mockHook = { task: { function: "myTask" } };
        loadCodebaseBuildStub.resolves({
          lifecycleHooks: {
            afterInstall: mockHook,
          },
        });

        const mockExistingBackend = backend.empty();
        sandbox.stub(backend, "existingBackend").resolves(mockExistingBackend);
        const executeHookStub = sandbox.stub(lifecycle, "executeHook").resolves();

        const { command: runCommand } = require("./functions-lifecycle-run");
        await runCommand.runner()("afterInstall", "my-codebase", options);

        expect(executeHookStub).to.have.been.calledWith(
          "afterInstall",
          mockHook,
          mockExistingBackend,
        );
      });
    });
  });
});
