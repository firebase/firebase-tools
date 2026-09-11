import { expect } from "chai";
import * as sinon from "sinon";

import { command } from "./functions-kits-uninstall";
import { requireAuth } from "../requireAuth";
import { requireConfig } from "../requireConfig";
import * as prompt from "../prompt";
import * as experiments from "../experiments";
import { Config } from "../config";
import { RC } from "../rc";

describe("functions:kits:uninstall", () => {
  const originalBefores = [...(command["befores"] || [])];
  let confirmStub: sinon.SinonStub;

  function createMockConfig(
    kitId = "my-kit",
    instanceId = "inst1",
  ): {
    config: Config;
    writeProjectFileStub: sinon.SinonStub;
  } {
    const writeProjectFileStub = sinon.stub();
    const config = {
      src: {
        functions: [
          {
            kit: kitId,
            source: `function-kits/${kitId}/source`,
            instances: {
              [instanceId]: `function-kits/${kitId}/config-${instanceId}`,
            },
          },
        ],
      },
      lsProjectDir: sinon.stub().returns([]),
      deleteProjectDir: sinon.stub(),
      set: sinon.stub(),
      writeProjectFile: writeProjectFileStub,
    } as unknown as Config;

    return { config, writeProjectFileStub };
  }

  beforeEach(() => {
    experiments.setEnabled("kits", true);
    command["befores"] = [];
    sinon.stub(command, "prepare").resolves();
    confirmStub = sinon.stub(prompt, "confirm").resolves(true);
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
});
