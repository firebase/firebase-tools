import { expect } from "chai";
import * as sinon from "sinon";

import { command } from "./functions-kits-uninstall";
import { requireAuth } from "../requireAuth";
import { requireConfig } from "../requireConfig";
import * as prompt from "../prompt";
import * as experiments from "../experiments";
import * as functionsDelete from "../deploy/functions/delete";
import { Config } from "../config";
import { RC } from "../rc";

describe("functions:kits:uninstall", () => {
  const originalBefores = [...(command["befores"] || [])];
  let confirmStub: sinon.SinonStub;
  let deleteFunctionsStub: sinon.SinonStub;

  function createMockConfig(
    kitId = "my-kit",
    instances: string | Record<string, string> = "inst1",
    options?: { conservativeDeletion?: boolean },
  ): {
    config: Config;
    writeProjectFileStub: sinon.SinonStub;
    deleteProjectDirStub: sinon.SinonStub;
    deleteProjectFileStub: sinon.SinonStub;
  } {
    const instancesObj =
      typeof instances === "string"
        ? { [instances]: `function-kits/${kitId}/config-${instances}` }
        : instances;
    const writeProjectFileStub = sinon.stub();
    const deleteProjectDirStub = sinon.stub();
    const deleteProjectFileStub = sinon.stub();
    const functionConfig: Record<string, unknown> = {
      kit: kitId,
      source: `function-kits/${kitId}/source`,
      instances: instancesObj,
    };
    if (!options?.conservativeDeletion) {
      functionConfig.sourcePackage = { name: `@firebase-function-kits/${kitId}` };
    }
    const config = {
      src: {
        functions: [functionConfig],
      },
      lsProjectDir: sinon.stub().returns([]),
      deleteProjectDir: deleteProjectDirStub,
      deleteProjectFile: deleteProjectFileStub,
      projectFileExists: sinon.stub().returns(true),
      projectDirExists: sinon.stub().returns(true),
      set: sinon.stub(),
      writeProjectFile: writeProjectFileStub,
    } as unknown as Config;

    return { config, writeProjectFileStub, deleteProjectDirStub, deleteProjectFileStub };
  }

  beforeEach(() => {
    experiments.setEnabled("kits", true);
    command["befores"] = [];
    sinon.stub(command, "prepare").resolves();
    confirmStub = sinon.stub(prompt, "confirm").resolves(true);
    deleteFunctionsStub = sinon
      .stub(functionsDelete, "deleteFunctionsByEndpointFilters")
      .resolves(1);
  });

  afterEach(() => {
    experiments.setEnabled("kits", null);
    command["befores"] = [...originalBefores];
    sinon.restore();
  });

  describe("command configuration", () => {
    it("should have requireConfig and requireAuth as before hooks", () => {
      expect(originalBefores).to.deep.equal([
        { fn: requireConfig, args: [] },
        { fn: requireAuth, args: [] },
      ]);
    });

    it("should define -f, --force option", () => {
      const forceOption = command["options"].find((opt: string[]) => opt[0] === "-f, --force");
      expect(forceOption).to.be.an("array");
      expect(forceOption?.[1]).to.equal("automatically accept all interactive prompts");
    });
  });

  describe("command action with --force", () => {
    describe("when uninstalling a kit (--kit)", () => {
      it("should pass force option to confirm prompt", async () => {
        const { config, writeProjectFileStub } = createMockConfig("my-kit", "inst1");

        await command.runner()({
          kit: "my-kit",
          config,
          nonInteractive: true,
          force: true,
        });

        expect(confirmStub).to.have.been.calledOnce;
        expect(confirmStub).to.have.been.calledWith(
          sinon.match({
            force: true,
            nonInteractive: true,
            default: false,
          }),
        );
        expect(writeProjectFileStub).to.have.been.called;
      });

      it("should abort if confirmation prompt returns false", async () => {
        confirmStub.resolves(false);
        const { config, writeProjectFileStub } = createMockConfig("my-kit", "inst1");

        await command.runner()({
          kit: "my-kit",
          config,
          nonInteractive: true,
          force: false,
        });

        expect(confirmStub).to.have.been.calledOnce;
        expect(writeProjectFileStub).to.not.have.been.called;
      });
    });

    describe("when uninstalling the last instance (--instance)", () => {
      it("should pass force option to confirm prompt", async () => {
        const { config, writeProjectFileStub } = createMockConfig("my-kit", "inst1");

        await command.runner()({
          instance: "inst1",
          project: "test-project",
          projectId: "test-project",
          rc: {} as unknown as RC,
          config,
          nonInteractive: true,
          force: true,
        });

        expect(confirmStub).to.have.been.calledOnce;
        expect(confirmStub).to.have.been.calledWith(
          sinon.match({
            force: true,
            nonInteractive: true,
            default: false,
          }),
        );
        expect(writeProjectFileStub).to.have.been.called;
      });

      it("should abort if confirmation prompt returns false", async () => {
        confirmStub.resolves(false);
        const { config, writeProjectFileStub } = createMockConfig("my-kit", "inst1");

        await command.runner()({
          instance: "inst1",
          project: "test-project",
          projectId: "test-project",
          rc: {} as unknown as RC,
          config,
          nonInteractive: true,
          force: false,
        });

        expect(confirmStub).to.have.been.calledOnce;
        expect(writeProjectFileStub).to.not.have.been.called;
      });
    });
  });

  describe("batching endpoint deletions across instances", () => {
    it("should batch delete functions for all instances targeting the same project into a single call", async () => {
      const { config, writeProjectFileStub, deleteProjectDirStub } = createMockConfig("my-kit", {
        inst1: "function-kits/my-kit/config-inst1",
        inst2: "function-kits/my-kit/config-inst2",
      });

      // Mock lsProjectDir to return .env files pointing to the same project
      (config.lsProjectDir as sinon.SinonStub).callsFake((dirPath: string) => {
        if (dirPath.includes("config-inst1") || dirPath.includes("config-inst2")) {
          return [{ name: ".env.my-project", isFile: () => true }];
        }
        return [];
      });

      await command.runner()({
        kit: "my-kit",
        config,
        nonInteractive: true,
        force: true,
      });

      expect(deleteFunctionsStub).to.have.been.calledOnce;
      expect(deleteFunctionsStub).to.have.been.calledWith(
        sinon.match({
          projectId: "my-project",
          filters: [{ codebase: "inst1" }, { codebase: "inst2" }],
        }),
      );
      expect(deleteProjectDirStub).to.have.been.calledWith("function-kits/my-kit");
      expect(writeProjectFileStub).to.have.been.calledOnce;
    });

    it("should group endpoint deletions by project when instances target different projects", async () => {
      const { config, writeProjectFileStub } = createMockConfig("my-kit", {
        inst1: "function-kits/my-kit/config-inst1",
        inst2: "function-kits/my-kit/config-inst2",
      });

      (config.lsProjectDir as sinon.SinonStub).callsFake((dirPath: string) => {
        if (dirPath.includes("config-inst1")) {
          return [{ name: ".env.project-a", isFile: () => true }];
        }
        if (dirPath.includes("config-inst2")) {
          return [{ name: ".env.project-b", isFile: () => true }];
        }
        return [];
      });

      await command.runner()({
        kit: "my-kit",
        config,
        nonInteractive: true,
        force: true,
      });

      expect(deleteFunctionsStub).to.have.been.calledTwice;
      expect(deleteFunctionsStub.firstCall).to.have.been.calledWith(
        sinon.match({
          projectId: "project-a",
          filters: [{ codebase: "inst1" }],
        }),
      );
      expect(deleteFunctionsStub.secondCall).to.have.been.calledWith(
        sinon.match({
          projectId: "project-b",
          filters: [{ codebase: "inst2" }],
        }),
      );
      expect(writeProjectFileStub).to.have.been.calledOnce;
    });

    it("should resolve project aliases using rc when batching deletions", async () => {
      const { config, writeProjectFileStub } = createMockConfig("my-kit", {
        inst1: "function-kits/my-kit/config-inst1",
        inst2: "function-kits/my-kit/config-inst2",
      });

      (config.lsProjectDir as sinon.SinonStub).callsFake((dirPath: string) => {
        if (dirPath.includes("config-inst1") || dirPath.includes("config-inst2")) {
          return [{ name: ".env.staging", isFile: () => true }];
        }
        return [];
      });

      const rc = new RC(undefined, { projects: { staging: "my-project" } });

      await command.runner()({
        kit: "my-kit",
        config,
        rc,
        nonInteractive: true,
        force: true,
      });

      expect(deleteFunctionsStub).to.have.been.calledOnce;
      expect(deleteFunctionsStub).to.have.been.calledWith(
        sinon.match({
          projectId: "my-project",
          filters: [{ codebase: "inst1" }, { codebase: "inst2" }],
        }),
      );
      expect(writeProjectFileStub).to.have.been.calledOnce;
    });

    it("should clean up individual .env files and empty instance directories in conservative deletion mode", async () => {
      const { config, deleteProjectDirStub, deleteProjectFileStub, writeProjectFileStub } =
        createMockConfig(
          "my-kit",
          {
            inst1: "function-kits/my-kit/config-inst1",
            inst2: "function-kits/my-kit/config-inst2",
          },
          { conservativeDeletion: true },
        );

      const remainingFiles = new Map<string, string[]>([
        ["function-kits/my-kit/config-inst1", [".env.my-project"]],
        ["function-kits/my-kit/config-inst2", [".env.my-project"]],
        ["function-kits/my-kit", []],
      ]);

      (config.lsProjectDir as sinon.SinonStub).callsFake((dirPath: string) => {
        const files = remainingFiles.get(dirPath) ?? [];
        return files.map((name) => ({ name, isFile: () => true }));
      });

      (config.deleteProjectFile as sinon.SinonStub).callsFake((filePath: string) => {
        for (const [dir, files] of remainingFiles.entries()) {
          const idx = files.findIndex((f) => filePath === `${dir}/${f}`);
          if (idx !== -1) {
            files.splice(idx, 1);
          }
        }
      });

      await command.runner()({
        kit: "my-kit",
        config,
        nonInteractive: true,
        force: true,
      });

      expect(deleteFunctionsStub).to.have.been.calledOnce;
      expect(deleteProjectFileStub).to.have.been.calledWith(
        "function-kits/my-kit/config-inst1/.env.my-project",
      );
      expect(deleteProjectFileStub).to.have.been.calledWith(
        "function-kits/my-kit/config-inst2/.env.my-project",
      );
      expect(deleteProjectDirStub).to.have.been.calledWith("function-kits/my-kit/config-inst1");
      expect(deleteProjectDirStub).to.have.been.calledWith("function-kits/my-kit/config-inst2");
      expect(deleteProjectDirStub).to.have.been.calledWith("function-kits/my-kit");
      expect(writeProjectFileStub).to.have.been.calledOnce;
    });

    it("should not delete local files or update firebase.json if deleteFunctionsByEndpointFilters fails", async () => {
      deleteFunctionsStub.rejects(new Error("GCP error"));
      const { config, writeProjectFileStub, deleteProjectDirStub } = createMockConfig("my-kit", {
        inst1: "function-kits/my-kit/config-inst1",
        inst2: "function-kits/my-kit/config-inst2",
      });

      (config.lsProjectDir as sinon.SinonStub).callsFake((dirPath: string) => {
        if (dirPath.includes("config-inst1")) {
          return [{ name: ".env.my-project", isFile: () => true }];
        }
        return [];
      });

      let error: unknown;
      try {
        await command.runner()({
          kit: "my-kit",
          config,
          nonInteractive: true,
          force: true,
        });
      } catch (e: unknown) {
        error = e;
      }

      expect(error).to.be.an.instanceOf(Error);
      expect(deleteProjectDirStub).to.not.have.been.called;
      expect(writeProjectFileStub).to.not.have.been.called;
    });

    it("should safely handle non-existent instance directories without throwing", async () => {
      const { config, writeProjectFileStub } = createMockConfig("my-kit", "inst1");
      (config.projectDirExists as sinon.SinonStub).returns(false);

      await command.runner()({
        kit: "my-kit",
        config,
        nonInteractive: true,
        force: true,
      });

      expect(deleteFunctionsStub).to.not.have.been.called;
      expect(writeProjectFileStub).to.have.been.calledOnce;
    });
  });
});
