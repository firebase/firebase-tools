import * as sinon from "sinon";
import { expect } from "chai";

import * as promptImport from "../../prompt";
import { Config } from "../../config";
import { Setup } from "..";
import { actuate, askQuestions } from "./functions";
import { Options } from "../../options";
import { RC } from "../../rc";
import * as experiments from "../../experiments";
import spawn from "cross-spawn";
import * as initSpawn from "../spawn";

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
      nonInteractive: false,
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

        // say "yes" to enabling eslint for the js project
        prompt.confirm.onFirstCall().resolves(true);
        // do not install dependencies
        prompt.confirm.onSecondCall().resolves(false);
        askWriteProjectFileStub = sandbox.stub(emptyConfig, "askWriteProjectFile");
        askWriteProjectFileStub.resolves();

        await askQuestions(setup, emptyConfig, options);
        await actuate(setup, emptyConfig);

        expect(setup.config.functions[0]).to.deep.equal({
          source: TEST_SOURCE_DEFAULT,
          codebase: TEST_CODEBASE_DEFAULT,
          ignore: ["node_modules", ".git", "firebase-debug.log", "firebase-debug.*.log", "*.local"],
          predeploy: ['npm --prefix "$RESOURCE_DIR" run lint'],
          disallowLegacyRuntimeConfig: true,
        });
        expect(askWriteProjectFileStub.getCalls().map((call) => call.args[0])).to.have.members([
          `${TEST_SOURCE_DEFAULT}/package.json`,
          `${TEST_SOURCE_DEFAULT}/.eslintrc.js`,
          `${TEST_SOURCE_DEFAULT}/index.js`,
          `${TEST_SOURCE_DEFAULT}/.gitignore`,
        ]);
      });

      it("creates a new typescript codebase with the correct configuration", async () => {
        const setup = { config: { functions: [] }, rcfile: {} };
        prompt.select.onFirstCall().resolves("typescript");
        // Lint
        prompt.confirm.onFirstCall().resolves(true);
        // do not install dependencies
        prompt.confirm.onSecondCall().resolves(false);
        askWriteProjectFileStub = sandbox.stub(emptyConfig, "askWriteProjectFile");
        askWriteProjectFileStub.resolves();

        await askQuestions(setup, emptyConfig, options);
        await actuate(setup, emptyConfig);

        expect(setup.config.functions[0]).to.deep.equal({
          source: TEST_SOURCE_DEFAULT,
          codebase: TEST_CODEBASE_DEFAULT,
          ignore: ["node_modules", ".git", "firebase-debug.log", "firebase-debug.*.log", "*.local"],
          predeploy: [
            'npm --prefix "$RESOURCE_DIR" run lint',
            'npm --prefix "$RESOURCE_DIR" run build',
          ],
          disallowLegacyRuntimeConfig: true,
        });
        expect(askWriteProjectFileStub.getCalls().map((call) => call.args[0])).to.have.members([
          `${TEST_SOURCE_DEFAULT}/package.json`,
          `${TEST_SOURCE_DEFAULT}/.eslintrc.js`,
          `${TEST_SOURCE_DEFAULT}/tsconfig.dev.json`,
          `${TEST_SOURCE_DEFAULT}/tsconfig.json`,
          `${TEST_SOURCE_DEFAULT}/src/index.ts`,
          `${TEST_SOURCE_DEFAULT}/.gitignore`,
        ]);
      });

      describe("python project", () => {
        let spawnStub: sinon.SinonStub;
        let wrapSpawnStub: sinon.SinonStub;

        beforeEach(() => {
          spawnStub = sandbox.stub(spawn, "spawn");
          wrapSpawnStub = sandbox.stub(initSpawn, "wrapSpawn");
        });

        it("creates a new python codebase with the correct configuration", async () => {
          const config = new Config("{}", { projectDir: "test", cwd: "test" });
          const setup = { config: { functions: [] }, rcfile: {} };
          prompt.select.onFirstCall().resolves("python");
          // do not install dependencies
          prompt.confirm.onFirstCall().resolves(false);
          askWriteProjectFileStub = sandbox.stub(config, "askWriteProjectFile");
          askWriteProjectFileStub.resolves();
          wrapSpawnStub.resolves();

          await askQuestions(setup, config, options);
          await actuate(setup, config);

          expect(setup.config.functions[0]).to.deep.equal({
            source: TEST_SOURCE_DEFAULT,
            codebase: TEST_CODEBASE_DEFAULT,
            ignore: ["venv", ".git", "firebase-debug.log", "firebase-debug.*.log", "*.local"],
            runtime: "python314",
            disallowLegacyRuntimeConfig: true,
          });
          expect(askWriteProjectFileStub.getCalls().map((call) => call.args[0])).to.have.members([
            `${TEST_SOURCE_DEFAULT}/requirements.txt`,
            `${TEST_SOURCE_DEFAULT}/.gitignore`,
            `${TEST_SOURCE_DEFAULT}/main.py`,
          ]);
          expect(wrapSpawnStub.callCount).to.equal(1);
          expect(spawnStub.callCount).to.equal(0);
        });

        it("throws FirebaseError if venv creation fails", async () => {
          const config = new Config("{}", { projectDir: "test", cwd: "test" });
          const setup = { config: { functions: [] }, rcfile: {} };
          prompt.select.onFirstCall().resolves("python");
          prompt.confirm.onFirstCall().resolves(false);
          askWriteProjectFileStub = sandbox.stub(config, "askWriteProjectFile");
          askWriteProjectFileStub.resolves();
          wrapSpawnStub.rejects(new Error("Failed to spawn"));

          await askQuestions(setup, config, options);
          let err: Error | null = null;
          try {
            await actuate(setup, config);
          } catch (e: any) {
            err = e;
          }
          expect(err).to.not.be.null;
          expect(err!.message).to.contain("Failed to create virtual environment");
        });

        it("installs dependencies successfully if user confirms", async () => {
          const config = new Config("{}", { projectDir: "test", cwd: "test" });
          const setup = { config: { functions: [] }, rcfile: {} };
          prompt.select.onFirstCall().resolves("python");
          prompt.confirm.onFirstCall().resolves(true); // install dependencies
          askWriteProjectFileStub = sandbox.stub(config, "askWriteProjectFile");
          askWriteProjectFileStub.resolves();
          wrapSpawnStub.resolves();

          const successProcess = {
            on: (event: string, callback: (code: number | null) => void) => {
              if (event === "exit") {
                setTimeout(() => callback(0), 0);
              }
            },
          };
          spawnStub.returns(successProcess);

          await askQuestions(setup, config, options);
          await actuate(setup, config);

          expect(wrapSpawnStub.callCount).to.equal(1);
          expect(spawnStub.callCount).to.equal(2); // pip upgrade, pip install
        });

        it("throws FirebaseError if pip upgrade fails", async () => {
          const config = new Config("{}", { projectDir: "test", cwd: "test" });
          const setup = { config: { functions: [] }, rcfile: {} };
          prompt.select.onFirstCall().resolves("python");
          prompt.confirm.onFirstCall().resolves(true); // install dependencies
          askWriteProjectFileStub = sandbox.stub(config, "askWriteProjectFile");
          askWriteProjectFileStub.resolves();
          wrapSpawnStub.resolves();

          const failProcess = {
            on: (event: string, callback: (code: number | null) => void) => {
              if (event === "exit") {
                setTimeout(() => callback(1), 0);
              }
            },
          };
          spawnStub.returns(failProcess); // pip upgrade fails

          await askQuestions(setup, config, options);
          let err: Error | null = null;
          try {
            await actuate(setup, config);
          } catch (e: any) {
            err = e;
          }
          expect(err).to.not.be.null;
          expect(err!.message).to.contain("Failed to upgrade pip inside virtual environment");
        });

        it("throws FirebaseError if dependency installation fails", async () => {
          const config = new Config("{}", { projectDir: "test", cwd: "test" });
          const setup = { config: { functions: [] }, rcfile: {} };
          prompt.select.onFirstCall().resolves("python");
          prompt.confirm.onFirstCall().resolves(true); // install dependencies
          askWriteProjectFileStub = sandbox.stub(config, "askWriteProjectFile");
          askWriteProjectFileStub.resolves();
          wrapSpawnStub.resolves();

          const successProcess = {
            on: (event: string, callback: (code: number | null) => void) => {
              if (event === "exit") {
                setTimeout(() => callback(0), 0);
              }
            },
          };
          const failProcess = {
            on: (event: string, callback: (code: number | null) => void) => {
              if (event === "exit") {
                setTimeout(() => callback(1), 0);
              }
            },
          };
          spawnStub.onCall(0).returns(successProcess); // pip upgrade succeeds
          spawnStub.onCall(1).returns(failProcess); // pip install fails

          await askQuestions(setup, config, options);
          let err: Error | null = null;
          try {
            await actuate(setup, config);
          } catch (e: any) {
            err = e;
          }
          expect(err).to.not.be.null;
          expect(err!.message).to.contain("Failed to install dependencies");
        });

        it("throws FirebaseError if venv creation encounters an error event", async () => {
          const config = new Config("{}", { projectDir: "test", cwd: "test" });
          const setup = { config: { functions: [] }, rcfile: {} };
          prompt.select.onFirstCall().resolves("python");
          prompt.confirm.onFirstCall().resolves(false);
          askWriteProjectFileStub = sandbox.stub(config, "askWriteProjectFile");
          askWriteProjectFileStub.resolves();
          wrapSpawnStub.rejects(new Error("Spawn error"));

          await askQuestions(setup, config, options);
          let err: Error | null = null;
          try {
            await actuate(setup, config);
          } catch (e: any) {
            err = e;
          }
          expect(err).to.not.be.null;
          expect(err!.message).to.contain("Failed to create virtual environment");
        });
      });

      it("does not show Dart as an option when experiments are disabled", async () => {
        const wasEnabled = experiments.isEnabled("dartfunctions");
        experiments.setEnabled("dartfunctions", false);
        const setup = { config: { functions: [] }, rcfile: {} };
        // We just need it to resolve to get past askQuestions
        prompt.select.onFirstCall().resolves("javascript");
        prompt.confirm.resolves(false); // don't lint, don't install

        try {
          await askQuestions(setup, emptyConfig, options);

          const selectCall = prompt.select.getCall(0);
          const choices = selectCall.args[0].choices;
          const values = choices.map((c: any) => c.value);
          expect(values).to.not.include("dart");
        } finally {
          experiments.setEnabled("dartfunctions", wasEnabled);
        }
      });

      it("shows Dart as an option when dartfunctions is enabled", async () => {
        experiments.setEnabled("dartfunctions", true);
        const setup = { config: { functions: [] }, rcfile: {} };
        prompt.select.onFirstCall().resolves("javascript");
        prompt.confirm.resolves(false);

        try {
          await askQuestions(setup, emptyConfig, options);

          const selectCall = prompt.select.getCall(0);
          const choices = selectCall.args[0].choices;
          const values = choices.map((c: any) => c.value);
          expect(values).to.include("dart");
        } finally {
          experiments.setEnabled("dartfunctions", false);
        }
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
        // Lint but do not install dependencies
        prompt.confirm.onFirstCall().resolves(true);
        prompt.confirm.onSecondCall().resolves(false);
        askWriteProjectFileStub = sandbox.stub(config, "askWriteProjectFile");
        askWriteProjectFileStub.resolves();

        await askQuestions(setup, config, options);
        await actuate(setup, config);

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
            disallowLegacyRuntimeConfig: true,
          },
        ]);
        expect(askWriteProjectFileStub.getCalls().map((call) => call.args[0])).to.have.members([
          `testsource2/package.json`,
          `testsource2/.eslintrc.js`,
          `testsource2/index.js`,
          `testsource2/.gitignore`,
        ]);
      });

      it("reinitializes an existing codebase", async () => {
        const { setup, config } = createExistingTestSetupAndConfig();
        prompt.select.onFirstCall().resolves("reinit");
        prompt.select.onSecondCall().resolves("javascript");

        // Lint but do not install dependencies
        prompt.confirm.onFirstCall().resolves(true);
        prompt.confirm.onSecondCall().resolves(false);
        askWriteProjectFileStub = sandbox.stub(config, "askWriteProjectFile");
        askWriteProjectFileStub.resolves();

        await askQuestions(setup, config, options);
        await actuate(setup, config);

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
        expect(askWriteProjectFileStub.getCalls().map((call) => call.args[0])).to.have.members([
          `${TEST_SOURCE_DEFAULT}/package.json`,
          `${TEST_SOURCE_DEFAULT}/.eslintrc.js`,
          `${TEST_SOURCE_DEFAULT}/index.js`,
          `${TEST_SOURCE_DEFAULT}/.gitignore`,
        ]);
      });
    });
  });
}).timeout(5000);
