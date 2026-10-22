import { expect } from "chai";
import * as sinon from "sinon";
import { basename, dirname } from "path/posix";

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
    instances: Record<string, string> = {
      inst1: `function-kits/${kitId}/config-inst1`,
    },
    filesByDir: Record<string, string[]> = {},
  ): {
    config: Config;
    writeProjectFileStub: sinon.SinonStub;
    deleteProjectDirStub: sinon.SinonStub;
    deleteProjectFileStub: sinon.SinonStub;
  } {
    const writeProjectFileStub = sinon.stub();
    const deleteProjectDirStub = sinon.stub().callsFake((dirPath: string) => {
      const parent = dirname(dirPath);
      const base = basename(dirPath);
      filesByDir[parent] = (filesByDir[parent] ?? []).filter((name) => name !== base);
    });
    const deleteProjectFileStub = sinon.stub().callsFake((filePath: string) => {
      const dir = dirname(filePath);
      const base = basename(filePath);
      filesByDir[dir] = (filesByDir[dir] ?? []).filter((name) => name !== base);
    });
    const config = {
      src: {
        functions: [
          {
            kit: kitId,
            source: `function-kits/${kitId}/source`,
            instances,
            sourcePackage: { name: `@firebase-function-kits/${kitId}` },
          },
        ],
      },
      lsProjectDir: sinon.stub().callsFake((dirPath: string) => {
        return (filesByDir[dirPath] ?? []).map((name) => ({ name, isFile: () => true }));
      }),
      deleteProjectDir: deleteProjectDirStub,
      deleteProjectFile: deleteProjectFileStub,
      projectFileExists: sinon.stub().returns(true),
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
        const { config, writeProjectFileStub } = createMockConfig();

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
        const { config, writeProjectFileStub } = createMockConfig();

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
        const { config, writeProjectFileStub } = createMockConfig();

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
        const { config, writeProjectFileStub } = createMockConfig();

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
      const { config, writeProjectFileStub, deleteProjectDirStub } = createMockConfig(
        "my-kit",
        {
          inst1: "function-kits/my-kit/config-inst1",
          inst2: "function-kits/my-kit/config-inst2",
        },
        {
          "function-kits/my-kit/config-inst1": [".env.my-project"],
          "function-kits/my-kit/config-inst2": [".env.my-project"],
        },
      );

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

    it("should group endpoint deletions by project and resolve aliases when instances target different projects", async () => {
      const { config, writeProjectFileStub } = createMockConfig(
        "my-kit",
        {
          inst1: "function-kits/my-kit/config-inst1",
          inst2: "function-kits/my-kit/config-inst2",
        },
        {
          "function-kits/my-kit/config-inst1": [".env.alias-a"],
          "function-kits/my-kit/config-inst2": [".env.project-b"],
        },
      );

      const rc = new RC(undefined, { projects: { "alias-a": "project-a" } });

      await command.runner()({
        kit: "my-kit",
        config,
        rc,
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

    it("should clean up .env files and empty config directories individually in conservative deletion mode", async () => {
      const { config, writeProjectFileStub, deleteProjectDirStub, deleteProjectFileStub } =
        createMockConfig(
          "my-kit",
          {
            inst1: "custom-dir/config-inst1",
            inst2: "custom-dir/config-inst2",
          },
          {
            "custom-dir": ["config-inst1", "config-inst2"],
            "custom-dir/config-inst1": [".env.my-project"],
            "custom-dir/config-inst2": [".env.my-project", "custom.txt"],
          },
        );

      await command.runner()({
        kit: "my-kit",
        config,
        nonInteractive: true,
        force: true,
      });

      expect(deleteProjectFileStub).to.have.been.calledWith(
        "custom-dir/config-inst1/.env.my-project",
      );
      expect(deleteProjectFileStub).to.have.been.calledWith(
        "custom-dir/config-inst2/.env.my-project",
      );
      expect(deleteProjectDirStub).to.have.been.calledOnceWithExactly("custom-dir/config-inst1");
      expect(writeProjectFileStub).to.have.been.calledOnce;
    });

    it("should not delete local files or update firebase.json if deleteFunctionsByEndpointFilters fails", async () => {
      deleteFunctionsStub.rejects(new Error("GCP error"));
      const { config, writeProjectFileStub, deleteProjectDirStub } = createMockConfig(
        "my-kit",
        {
          inst1: "function-kits/my-kit/config-inst1",
          inst2: "function-kits/my-kit/config-inst2",
        },
        {
          "function-kits/my-kit/config-inst1": [".env.my-project"],
        },
      );

      await expect(
        command.runner()({
          kit: "my-kit",
          config,
          nonInteractive: true,
          force: true,
        }),
      ).to.be.rejectedWith("GCP error");

      expect(deleteProjectDirStub).to.not.have.been.called;
      expect(writeProjectFileStub).to.not.have.been.called;
    });
  });
});
