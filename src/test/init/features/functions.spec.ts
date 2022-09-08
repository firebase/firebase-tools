import * as sinon from "sinon";
import { Config } from "../../../config";
import * as prompt from "../../../prompt";
import { Setup } from "../../../init";
import { doSetup } from "../../../init/features/functions";
import { Options } from "../../../options";
import { RC } from "../../../rc";
import { expect } from "chai";
import * as _ from "lodash";

function createExistingTestSetupAndConfig(): { setup: Setup; config: Config } {
  const cbconfig = {
    source: "testsource",
    codebase: "testcodebase",
    ignore: ["node_modules", ".git", "firebase-debug.log", "firebase-debug.*.log"],
    predeploy: ['npm --prefix "$RESOURCE_DIR" run lint'],
  };

  return {
    setup: {
      config: {
        functions: [cbconfig],
      },
      rcfile: { projects: {} },
      featureArg: true,
    },
    config: new Config(
      {
        functions: [cbconfig],
      },
      { projectDir: "test", cwd: "test" }
    ),
  };
}

describe("functions", () => {
  const sandbox: sinon.SinonSandbox = sinon.createSandbox();
  let promptOnceStub: sinon.SinonStub;
  let promptStub: sinon.SinonStub;
  // let spawnStub: sinon.SinonStub;
  let askWriteProjectFileStub: sinon.SinonStub;
  let emptyConfig: Config;
  let options: Options;

  beforeEach(() => {
    promptOnceStub = sandbox.stub(prompt, "promptOnce").throws("Unexpected promptOnce call");
    promptStub = sandbox.stub(prompt, "prompt").throws("Unexpected prompt call");
    // spawnStub = sandbox.stub(spawn, "spawn");

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
    sandbox.restore();
  });

  describe("doSetup", () => {
    describe("with an uninitialized Firebase project repository", () => {
      it("creates a new javascript codebase with the correct configuration", async () => {
        const setup = { config: {}, rcfile: {} };
        promptOnceStub.onFirstCall().resolves("testsource");
        promptOnceStub.onSecondCall().resolves("testcodebase");
        promptOnceStub.onThirdCall().resolves("javascript");

        // eslint?
        promptStub.onFirstCall().callsFake((functions: any): Promise<void> => {
          functions.lint = true;
          return Promise.resolve();
        });
        // install dependencies?
        promptStub.onSecondCall().callsFake((setup: any): Promise<void> => {
          setup.npm = false;
          return Promise.resolve();
        });
        askWriteProjectFileStub = sandbox.stub(emptyConfig, "askWriteProjectFile");
        askWriteProjectFileStub.resolves(true);

        const setupExpected = {
          source: "testsource",
          codebase: "testcodebase",
          ignore: ["node_modules", ".git", "firebase-debug.log", "firebase-debug.*.log"],
          predeploy: ['npm --prefix "$RESOURCE_DIR" run lint'],
        };
        const writeFilesExpected = [
          `${setupExpected.source}/package.json`,
          `${setupExpected.source}/.eslintrc.js`,
          `${setupExpected.source}/index.js`,
          `${setupExpected.source}/.gitignore`,
        ];

        await doSetup(setup, emptyConfig, options);

        expect(_.get(setup, "config.functions.0")).to.deep.equal(setupExpected);
        expect(askWriteProjectFileStub.getCalls().map((call) => call.args[0])).to.deep.equal(
          writeFilesExpected
        );
      });

      it("creates a new typescript codebase with the correct configuration", async () => {
        const setup = { config: {}, rcfile: {} };
        promptOnceStub.onFirstCall().resolves("testsource");
        promptOnceStub.onSecondCall().resolves("testcodebase");
        promptOnceStub.onThirdCall().resolves("typescript");
        // promptStub.withArgs(setup.functions, FUNCTIONS_ESLINT_QUESTION).resolves(true);
        // promptStub.onFirstCall().resolves(true); // use eslint?
        promptStub.onFirstCall().callsFake((functions: any): Promise<void> => {
          functions.lint = true;
          return Promise.resolve();
        });
        promptStub.onSecondCall().resolves(); // install dependencies?
        askWriteProjectFileStub = sandbox.stub(emptyConfig, "askWriteProjectFile");
        askWriteProjectFileStub.resolves(true);

        const setupExpected = {
          source: "testsource",
          codebase: "testcodebase",
          ignore: ["node_modules", ".git", "firebase-debug.log", "firebase-debug.*.log"],
          predeploy: [
            'npm --prefix "$RESOURCE_DIR" run lint',
            'npm --prefix "$RESOURCE_DIR" run build',
          ],
        };
        const writeFilesExpected = [
          `${setupExpected.source}/package.json`,
          `${setupExpected.source}/.eslintrc.js`,
          `${setupExpected.source}/tsconfig.json`,
          `${setupExpected.source}/tsconfig.dev.json`,
          `${setupExpected.source}/src/index.ts`,
          `${setupExpected.source}/.gitignore`,
        ];

        await doSetup(setup, emptyConfig, options);

        expect(_.get(setup, "config.functions.0")).to.deep.equal(setupExpected);
        expect(askWriteProjectFileStub.getCalls().map((call) => call.args[0])).to.deep.equal(
          writeFilesExpected
        );
      });
    });
    describe("with an existing functions codebase in Firebase repository", () => {
      it("initializes a new codebase", async () => {
        const { setup, config } = createExistingTestSetupAndConfig();
        promptOnceStub.onCall(0).resolves("new");
        promptOnceStub.onCall(1).resolves("testsource2");
        promptOnceStub.onCall(2).resolves("testcodebase2");
        promptOnceStub.onCall(3).resolves("javascript");
        promptStub.onFirstCall().callsFake((functions: any): Promise<void> => {
          functions.lint = true;
          return Promise.resolve();
        });
        promptStub.onSecondCall().resolves(false); // install dependencies?
        askWriteProjectFileStub = sandbox.stub(config, "askWriteProjectFile");
        askWriteProjectFileStub.resolves(true);

        const setupExpected = [
          {
            source: "testsource",
            codebase: "testcodebase",
            ignore: ["node_modules", ".git", "firebase-debug.log", "firebase-debug.*.log"],
            predeploy: ['npm --prefix "$RESOURCE_DIR" run lint'],
          },
          {
            source: "testsource2",
            codebase: "testcodebase2",
            ignore: ["node_modules", ".git", "firebase-debug.log", "firebase-debug.*.log"],
            predeploy: ['npm --prefix "$RESOURCE_DIR" run lint'],
          },
        ];
        const writeFilesExpected = [
          `testsource2/package.json`,
          `testsource2/.eslintrc.js`,
          `testsource2/index.js`,
          `testsource2/.gitignore`,
        ];

        await doSetup(setup, config, options);

        expect(_.get(setup, "config.functions")).to.deep.equal(setupExpected);
        expect(askWriteProjectFileStub.getCalls().map((call) => call.args[0])).to.deep.equal(
          writeFilesExpected
        );
      });

      it("reinitializes an existing codebase", async () => {
        const { setup, config } = createExistingTestSetupAndConfig();
        promptOnceStub.onCall(0).resolves("reinit");
        promptOnceStub.onCall(1).resolves("testcodebase");
        promptOnceStub.onCall(2).resolves("javascript");
        promptStub.onFirstCall().callsFake((functions: any): Promise<void> => {
          functions.lint = true;
          return Promise.resolve();
        });
        promptStub.onSecondCall().resolves(false);
        askWriteProjectFileStub = sandbox.stub(config, "askWriteProjectFile");
        askWriteProjectFileStub.resolves(true);

        const setupExpected = [
          {
            source: "testsource",
            codebase: "testcodebase",
            ignore: ["node_modules", ".git", "firebase-debug.log", "firebase-debug.*.log"],
            predeploy: ['npm --prefix "$RESOURCE_DIR" run lint'],
          },
        ];
        const writeFilesExpected = [
          `testsource/package.json`,
          `testsource/.eslintrc.js`,
          `testsource/index.js`,
          `testsource/.gitignore`,
        ];

        await doSetup(setup, config, options);

        expect(_.get(setup, "config.functions")).to.deep.equal(setupExpected);
        expect(askWriteProjectFileStub.getCalls().map((call) => call.args[0])).to.deep.equal(
          writeFilesExpected
        );
      });
      // TODO: legacy config
    });
  });
});
