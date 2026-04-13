import * as sinon from "sinon";
import { expect } from "chai";
import * as fs from "fs";

import * as genkit from ".";
import * as prompt from "../../../prompt";
import * as spawn from "../../spawn";
import * as projectUtils from "../../../projectUtils";
import * as functions from "../functions";
import * as ensureApiEnabled from "../../../ensureApiEnabled";
import { Options } from "../../../options";
import { RC } from "../../../rc";
import { Config } from "../../../config";

describe("genkit", () => {
  const sandbox: sinon.SinonSandbox = sinon.createSandbox();
  let promptStub: sinon.SinonStubbedInstance<typeof prompt>;
  let spawnStub: sinon.SinonStubbedInstance<typeof spawn>;
  let functionsStub: sinon.SinonStubbedInstance<typeof functions>;
  let readFileSyncStub: sinon.SinonStub;
  let writeFileSyncStub: sinon.SinonStub;
  let existsSyncStub: sinon.SinonStub;
  let options: Options;
  let cfg: Config;

  beforeEach(() => {
    promptStub = sandbox.stub(prompt);
    spawnStub = sandbox.stub(spawn);
    functionsStub = sandbox.stub(functions);
    sandbox.stub(ensureApiEnabled);
    sandbox.stub(projectUtils, "getProjectId").returns("test-project");

    readFileSyncStub = sandbox.stub(fs, "readFileSync");
    writeFileSyncStub = sandbox.stub(fs, "writeFileSync");
    existsSyncStub = sandbox.stub(fs, "existsSync");
    sandbox.stub(fs, "mkdirSync");

    options = {
      cwd: "",
      configPath: "",
      only: "",
      except: "",
      filteredTargets: [],
      force: false,
      nonInteractive: false,
      debug: false,
      config: new Config("{}", {}),
      rc: new RC(),
    };
    cfg = new Config({}, { projectDir: "test", cwd: "test" });
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("askQuestions", () => {
    beforeEach(() => {
      // Mock the behavior of functions.askQuestions
      functionsStub.askQuestions.callsFake(async (setup: any) => {
        setup.functions = {
          source: "functions",
          codebase: "default",
        };
        return Promise.resolve();
      });
      readFileSyncStub.returns("{}");
    });

    it("should set up a new genkit project", async () => {
      const setup: genkit.GenkitSetup = {
        config: {},
        rcfile: { projects: {}, targets: {}, etags: {} },
        instructions: [],
      };
      spawnStub.spawnWithOutput.resolves("1.0.0");
      promptStub.confirm.resolves(true);
      promptStub.select
        .onFirstCall()
        .resolves("globally") // install globally
        .onSecondCall()
        .resolves("vertexai") // use vertex
        .onThirdCall()
        .resolves("overwrite")
        .onCall(3)
        .resolves("overwrite");
      existsSyncStub.returns(true);

      await genkit.doSetup(setup, cfg, options);

      expect(setup.functions).to.deep.equal({
        source: "functions",
        codebase: "default",
      });
      expect(
        spawnStub.wrapSpawn.withArgs("npm", ["install", "-g", "genkit-cli@1.0.0"], "test/functions")
          .calledOnce,
      ).to.be.true;
      expect(
        spawnStub.wrapSpawn.withArgs(
          "npm",
          [
            "install",
            "express",
            "genkit@1.0.0",
            "@genkit-ai/firebase@1.0.0",
            "@genkit-ai/vertexai@1.0.0",
            "--save",
          ],
          "test/functions",
        ).calledOnce,
      ).to.be.true;
      expect(writeFileSyncStub.getCall(0).args[0]).to.equal("test/functions/tsconfig.json");
      expect(writeFileSyncStub.getCall(1).args[0]).to.equal("test/functions/package.json");
      expect(writeFileSyncStub.getCall(2).args[0]).to.equal("test/functions/src/genkit-sample.ts");
    });

    it("should install the cli locally", async () => {
      const setup: genkit.GenkitSetup = {
        config: {},
        rcfile: { projects: {}, targets: {}, etags: {} },
        instructions: [],
      };
      spawnStub.spawnWithOutput.resolves("1.0.0");
      promptStub.confirm.resolves(true);
      promptStub.select.onFirstCall().resolves("project").onSecondCall().resolves("vertexai");

      await genkit.doSetup(setup, cfg, options);

      expect(spawnStub.wrapSpawn.getCall(0).args).to.deep.equal([
        "npm",
        ["install", "genkit-cli@1.0.0", "--save-dev"],
        "test/functions",
      ]);
    });

    it("should set up with the googleai provider", async () => {
      const setup: genkit.GenkitSetup = {
        config: {},
        rcfile: { projects: {}, targets: {}, etags: {} },
        instructions: [],
      };
      spawnStub.spawnWithOutput.resolves("1.0.0");
      promptStub.confirm.resolves(true);
      promptStub.select.onFirstCall().resolves("project").onSecondCall().resolves("googleai");

      await genkit.doSetup(setup, cfg, options);

      expect(spawnStub.wrapSpawn.getCall(1).args).to.deep.equal([
        "npm",
        [
          "install",
          "express",
          "genkit@1.0.0",
          "@genkit-ai/firebase@1.0.0",
          "@genkit-ai/googleai@1.0.0",
          "--save",
        ],
        "test/functions",
      ]);
    });

    it("should not generate a sample file if the user declines", async () => {
      const setup: genkit.GenkitSetup = {
        config: {},
        rcfile: { projects: {}, targets: {}, etags: {} },
        instructions: [],
      };
      spawnStub.spawnWithOutput.resolves("1.0.0");
      promptStub.confirm.onFirstCall().resolves(true).onSecondCall().resolves(false);
      promptStub.select.onFirstCall().resolves("project").onSecondCall().resolves("googleai");
      existsSyncStub.withArgs(sinon.match(/package\.json$/)).returns(true);

      await genkit.doSetup(setup, cfg, options);

      // writeFileSync should only be called for tsconfig.json and package.json
      expect(writeFileSyncStub.callCount).to.equal(2);
    });

    it("should keep existing config files if the user chooses", async () => {
      const setup: genkit.GenkitSetup = {
        config: {},
        rcfile: { projects: {}, targets: {}, etags: {} },
        instructions: [],
      };
      spawnStub.spawnWithOutput.resolves("1.0.0");
      promptStub.confirm.onFirstCall().resolves(true).onSecondCall().resolves(false);
      promptStub.select
        .onFirstCall()
        .resolves("project")
        .onSecondCall()
        .resolves("vertexai")
        .onThirdCall()
        .resolves("keep")
        .onCall(3)
        .resolves("keep");
      existsSyncStub.returns(true);

      await genkit.doSetup(setup, cfg, options);

      // writeFileSync should not be called
      expect(writeFileSyncStub.callCount).to.equal(0);
    });

    it("should abort if the user declines functions setup", async () => {
      const setup: genkit.GenkitSetup = {
        config: {},
        rcfile: { projects: {}, targets: {}, etags: {} },
        instructions: [],
      };
      spawnStub.spawnWithOutput.resolves("1.0.0");
      promptStub.confirm.resolves(false);

      await genkit.doSetup(setup, cfg, options);

      expect(functionsStub.askQuestions.notCalled).to.be.true;
      expect(functionsStub.actuate.notCalled).to.be.true;
    });
  });
});
