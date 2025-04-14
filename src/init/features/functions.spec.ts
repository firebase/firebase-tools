import * as sinon from "sinon";
import { expect } from "chai";

import * as prompt from "../../prompt";
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
    },
    config: new Config({ functions: [cbconfig] }, { projectDir: "test", cwd: "test" }),
  };
}

describe("functions", () => {
  const sandbox: sinon.SinonSandbox = sinon.createSandbox();
  let promptOnceStub: sinon.SinonStub;
  let promptStub: sinon.SinonStub;
  let askWriteProjectFileStub: sinon.SinonStub;
  let emptyConfig: Config;
  let options: Options;

  beforeEach(() => {
    promptOnceStub = sandbox.stub(prompt, "promptOnce").throws("Unexpected promptOnce call");
    promptStub = sandbox.stub(prompt, "prompt").throws("Unexpected prompt call");

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
    sandbox.verifyAndRestore();
  });

  describe("doSetup", () => {
    describe("with an uninitialized Firebase project repository", () => {
      it("creates a new javascript codebase with the correct configuration", async () => {
        const setup = { config: { functions: [] }, rcfile: {} };
        promptOnceStub.onFirstCall().resolves("javascript");

        // say "yes" to enabling eslint for the js project
        promptStub.onFirstCall().callsFake((functions: any): Promise<void> => {
          functions.lint = true;
          return Promise.resolve();
        });
        // do not install dependencies
        promptStub.onSecondCall().resolves();
        askWriteProjectFileStub = sandbox.stub(emptyConfig, "askWriteProjectFile");
        askWriteProjectFileStub.resolves();

        await doSetup(setup, emptyConfig, options);

        expect(setup.config.functions[0]).to.deep.equal({
          source: TEST_SOURCE_DEFAULT,
          codebase: TEST_CODEBASE_DEFAULT,
          ignore: ["node_modules", ".git", "firebase-debug.log", "firebase-debug.*.log", "*.local"],
          predeploy: ['npm --prefix "$RESOURCE_DIR" run lint'],
        });
        expect(askWriteProjectFileStub.getCalls().map((call) => call.args[0])).to.deep.equal([
          `${TEST_SOURCE_DEFAULT}/package.json`,
          `${TEST_SOURCE_DEFAULT}/.eslintrc.js`,
          `${TEST_SOURCE_DEFAULT}/index.js`,
          `${TEST_SOURCE_DEFAULT}/.gitignore`,
        ]);
      });

      it("creates a new typescript codebase with the correct configuration", async () => {
        const setup = { config: { functions: [] }, rcfile: {} };
        promptOnceStub.onFirstCall().resolves("typescript");
        promptStub.onFirstCall().callsFake((functions: any): Promise<void> => {
          functions.lint = true;
          return Promise.resolve();
        });
        promptStub.onSecondCall().resolves();
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
          `${TEST_SOURCE_DEFAULT}/.eslintrc.js`,
          `${TEST_SOURCE_DEFAULT}/tsconfig.json`,
          `${TEST_SOURCE_DEFAULT}/tsconfig.dev.json`,
          `${TEST_SOURCE_DEFAULT}/src/index.ts`,
          `${TEST_SOURCE_DEFAULT}/.gitignore`,
        ]);
      });
    });
    describe("with an existing functions codebase in Firebase repository", () => {
      it("initializes a new codebase", async () => {
        const { setup, config } = createExistingTestSetupAndConfig();
        promptOnceStub.onCall(0).resolves("new");
        promptOnceStub.onCall(1).resolves("testcodebase2");
        promptOnceStub.onCall(2).resolves("testsource2");
        promptOnceStub.onCall(3).resolves("javascript");
        promptStub.onFirstCall().callsFake((functions: any): Promise<void> => {
          functions.lint = true;
          return Promise.resolve();
        });
        promptStub.onSecondCall().resolves();
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
            predeploy: ['npm --prefix "$RESOURCE_DIR" run lint'],
          },
        ]);
        expect(askWriteProjectFileStub.getCalls().map((call) => call.args[0])).to.deep.equal([
          `testsource2/package.json`,
          `testsource2/.eslintrc.js`,
          `testsource2/index.js`,
          `testsource2/.gitignore`,
        ]);
      });

      it("reinitializes an existing codebase", async () => {
        const { setup, config } = createExistingTestSetupAndConfig();
        promptOnceStub.onFirstCall().resolves("reinit");
        promptOnceStub.onSecondCall().resolves("javascript");
        promptStub.onFirstCall().callsFake((functions: any): Promise<void> => {
          functions.lint = true;
          return Promise.resolve();
        });
        promptStub.onSecondCall().resolves(false);
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
        ]);
        expect(askWriteProjectFileStub.getCalls().map((call) => call.args[0])).to.deep.equal([
          `${TEST_SOURCE_DEFAULT}/package.json`,
          `${TEST_SOURCE_DEFAULT}/.eslintrc.js`,
          `${TEST_SOURCE_DEFAULT}/index.js`,
          `${TEST_SOURCE_DEFAULT}/.gitignore`,
        ]);
      });
    });
  });
}).timeout(5000);
