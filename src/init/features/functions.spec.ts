import * as sinon from "sinon";
import { expect } from "chai";

import * as promptImport from "../../prompt";
import { Config } from "../../config";
import { Setup } from "..";
import { doSetup } from "./functions";
import { Options } from "../../options";
import { RC } from "../../rc";

const TEST_SOURCE_DEFAULT = "functions";
const TEST_CODEBASE_DEFAULT = "default";

function createExistingTestSetupAndConfig(): { setup: Setup; config: Config } {
  const cbconfig = {
    source: TEST_SOURCE_DEFAULT,
    codebase: TEST_CODEBASE_DEFAULT,
    ignore: ["node_modules", ".git", "firebase-debug.log", "firebase-debug.*.log", "*.local"],
    predeploy: ['npm --prefix "$RESOURCE_DIR" run lint'],
  };

  return {
    setup: {
      config: {
        functions: [cbconfig],
      },
      rcfile: { projects: {}, targets: {}, etags: {} },
      featureArg: true,
      instructions: [],
    },
    config: new Config({ functions: [cbconfig] }, { projectDir: "test", cwd: "test" }),
  };
}

describe("functions", () => {
  const sandbox: sinon.SinonSandbox = sinon.createSandbox();
  let prompt: sinon.SinonStubbedInstance<typeof promptImport>;
  let askWriteProjectFileStub: sinon.SinonStub;
  let emptyConfig: Config;
  let options: Options;

  beforeEach(() => {
    prompt = sinon.stub(promptImport);
    prompt.input.throws("Unexpected input call");
    prompt.select.throws("Unexpected select call");
    prompt.confirm.throws("Unexpected confirm call");

    emptyConfig = new Config("{}", {});
    options = {
      cwd: "",
      configPath: "",
      only: "",
      except: "",
      filteredTargets: [],
      force: false,
      json: false,
      nonInteractive: false,
      interactive: false,
      debug: false,
      config: emptyConfig,
      rc: new RC(),
    };
  });

  afterEach(() => {
    sinon.verifyAndRestore();
    sandbox.verifyAndRestore();
  });

  describe("doSetup", () => {
    describe("with an uninitialized Firebase project repository", () => {
      it("creates a new javascript codebase with the correct configuration", async () => {
        const setup = { config: { functions: [] }, rcfile: {} };
        prompt.select.onFirstCall().resolves("javascript");
        // do not install dependencies
        prompt.confirm.onFirstCall().resolves(false);
        askWriteProjectFileStub = sandbox.stub(emptyConfig, "askWriteProjectFile");
        askWriteProjectFileStub.resolves();

        await doSetup(setup, emptyConfig, options);

        expect(setup.config.functions[0]).to.deep.equal({
          source: TEST_SOURCE_DEFAULT,
          codebase: TEST_CODEBASE_DEFAULT,
          ignore: ["node_modules", ".git", "firebase-debug.log", "firebase-debug.*.log", "*.local"],
          predeploy: [],
        });
        expect(askWriteProjectFileStub.getCalls().map((call) => call.args[0])).to.deep.equal([
          `${TEST_SOURCE_DEFAULT}/package.json`,
          `${TEST_SOURCE_DEFAULT}/biome.json`,
          `${TEST_SOURCE_DEFAULT}/index.js`,
          `${TEST_SOURCE_DEFAULT}/.gitignore`,
        ]);
      });

      it("creates a new typescript codebase with the correct configuration", async () => {
        const setup = { config: { functions: [] }, rcfile: {} };
        prompt.select.onFirstCall().resolves("typescript");
        // do not install dependencies
        prompt.confirm.onFirstCall().resolves(false);
        askWriteProjectFileStub = sandbox.stub(emptyConfig, "askWriteProjectFile");
        askWriteProjectFileStub.resolves();

        await doSetup(setup, emptyConfig, options);

        expect(setup.config.functions[0]).to.deep.equal({
          source: TEST_SOURCE_DEFAULT,
          codebase: TEST_CODEBASE_DEFAULT,
          ignore: ["node_modules", ".git", "firebase-debug.log", "firebase-debug.*.log", "*.local"],
          predeploy: [
            'npm --prefix "$RESOURCE_DIR" run lint',
            'npm --prefix "$RESOURCE_DIR" run build',
          ],
        });
        expect(askWriteProjectFileStub.getCalls().map((call) => call.args[0])).to.deep.equal([
          `${TEST_SOURCE_DEFAULT}/package.json`,
          `${TEST_SOURCE_DEFAULT}/biome.json`,
          `${TEST_SOURCE_DEFAULT}/tsconfig.json`,
          `${TEST_SOURCE_DEFAULT}/src/index.ts`,
          `${TEST_SOURCE_DEFAULT}/.gitignore`,
        ]);
      });
    });

    describe("with an existing functions codebase in Firebase repository", () => {
      it("initializes a new codebase", async () => {
        const { setup, config } = createExistingTestSetupAndConfig();
        // Initialize a new codebase with a naming conflict at first
        prompt.select.onFirstCall().resolves("new");
        prompt.input.onFirstCall().resolves("testcodebase2");
        prompt.input.onSecondCall().resolves("testsource2");

        // Initialize as JavaScript
        prompt.select.onSecondCall().resolves("javascript");
        // do not install dependencies
        prompt.confirm.onFirstCall().resolves(false);
        askWriteProjectFileStub = sandbox.stub(config, "askWriteProjectFile");
        askWriteProjectFileStub.resolves();

        await doSetup(setup, config, options);

        expect(setup.config.functions).to.deep.equal([
          {
            source: TEST_SOURCE_DEFAULT,
            codebase: TEST_CODEBASE_DEFAULT,
            ignore: [
              "node_modules",
              ".git",
              "firebase-debug.log",
              "firebase-debug.*.log",
              "*.local",
            ],
            predeploy: ['npm --prefix "$RESOURCE_DIR" run lint'],
          },
          {
            source: "testsource2",
            codebase: "testcodebase2",
            ignore: [
              "node_modules",
              ".git",
              "firebase-debug.log",
              "firebase-debug.*.log",
              "*.local",
            ],
            predeploy: [],
          },
        ]);
        expect(askWriteProjectFileStub.getCalls().map((call) => call.args[0])).to.deep.equal([
          `testsource2/package.json`,
          `testsource2/biome.json`,
          `testsource2/index.js`,
          `testsource2/.gitignore`,
        ]);
      });

      it("reinitializes an existing codebase", async () => {
        const { setup, config } = createExistingTestSetupAndConfig();
        prompt.select.onFirstCall().resolves("reinit");
        prompt.select.onSecondCall().resolves("javascript");

        // do not install dependencies
        prompt.confirm.onFirstCall().resolves(false);
        askWriteProjectFileStub = sandbox.stub(config, "askWriteProjectFile");
        askWriteProjectFileStub.resolves();

        await doSetup(setup, config, options);

        expect(setup.config.functions).to.deep.equal([
          {
            source: TEST_SOURCE_DEFAULT,
            codebase: TEST_CODEBASE_DEFAULT,
            ignore: [
              "node_modules",
              ".git",
              "firebase-debug.log",
              "firebase-debug.*.log",
              "*.local",
            ],
            predeploy: [],
          },
        ]);
        expect(askWriteProjectFileStub.getCalls().map((call) => call.args[0])).to.deep.equal([
          `${TEST_SOURCE_DEFAULT}/package.json`,
          `${TEST_SOURCE_DEFAULT}/biome.json`,
          `${TEST_SOURCE_DEFAULT}/index.js`,
          `${TEST_SOURCE_DEFAULT}/.gitignore`,
        ]);
      });
    });
  });
}).timeout(5000);
