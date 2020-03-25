import async = require("async");
const expect = require("chai").expect;
import fs = require("fs");
import path = require("path");
import request = require("request");
import subprocess = require("child_process");

const PROJECT_ROOT = path.dirname(path.dirname(path.dirname(__filename)));
const EXTENSION_ROOT = path.dirname(__filename) + "/greet-the-world";

const FIREBASE_PROJECT = process.env.FBTOOLS_TARGET_PROJECT || "test";
const FIREBASE_PROJECT_ZONE = "us-east1";
const TEST_CONFIG_FILE = "test-firebase.json";
const TEST_FUNCTION_NAME = "greetTheWorld";
/*
 * Markers this test looks for in the emulator process stdout
 * as one test for whether the emualtor is functioning correctly.
 */
const ALL_EMULATORS_STARTED_LOG = "All emulators started, it is now safe to connect.";

/*
 * Various delays that are needed because this test spawns
 * parallel emulator subprocesses.
 */
const TEST_SETUP_TIMEOUT = 60000;
const EMULATORS_WRITE_DELAY_MS = 5000;
const EMULATORS_SHUTDOWN_DELAY_MS = 5000;
const EMULATOR_TEST_TIMEOUT = EMULATORS_WRITE_DELAY_MS * 2;

interface Config {
  functions: {};
  emulators: EmulatorsConfig;
}

interface EmulatorsConfig {
  hub: { port: number };
  functions: { port: number };
}

class CLIProcess {
  name: string;
  process?: subprocess.ChildProcess;

  constructor(name: string) {
    this.name = name;
    this.process = undefined;
  }

  start(
    cmd: string,
    additionalArgs: string[],
    logDoneFn: (data: string) => boolean
  ): Promise<void> {
    const args: string[] = [
      PROJECT_ROOT + "/lib/bin/firebase.js",
      cmd,
      "--project",
      FIREBASE_PROJECT,
    ];

    if (additionalArgs) {
      args.push(...additionalArgs);
    }

    // TODO(joehan): Delete the --open-sesame call when extdev flag is removed.
    subprocess.spawnSync("node", [
      PROJECT_ROOT + "/lib/bin/firebase.js",
      "--open-sesame",
      "extdev",
    ]);

    this.process = subprocess.spawn("node", args, { cwd: EXTENSION_ROOT });

    this.process.stdout.on("data", (data: string) => {
      process.stdout.write(`[${this.name} stdout] ` + data);
    });

    this.process.stderr.on("data", (data: string) => {
      console.log(`[${this.name} stderr] ` + data);
    });

    let started;
    if (logDoneFn) {
      started = new Promise<void>((resolve) => {
        this.process?.stdout.on("data", (data: string) => {
          if (logDoneFn(data)) {
            resolve();
          }
        });
      });
    } else {
      started = new Promise<void>((resolve) => {
        this.process?.once("close", () => {
          this.process = undefined;
          resolve();
        });
      });
    }

    return started;
  }

  stop(): Promise<void> {
    if (!this.process) {
      return Promise.resolve();
    }

    const stopped = new Promise<void>((resolve) => {
      this.process?.once("close", (/* exitCode, signal */) => {
        delete this.process;
        resolve();
      });
    });

    this.process.kill("SIGINT");
    return stopped;
  }
}

class TriggerEndToEndTest {
  functionsEmulatorPort: number;
  allEmulatorsStarted: boolean;
  cliProcess?: CLIProcess;

  constructor(config: Config) {
    this.functionsEmulatorPort = config.emulators.functions.port;
    this.allEmulatorsStarted = false;
  }

  success(): boolean {
    return this.allEmulatorsStarted;
  }

  startExtEmulators(additionalArgs: string[]): Promise<void> {
    const cli = new CLIProcess("default");
    const started = cli.start("ext:dev:emulators:start", additionalArgs, (data: string) => {
      return data.includes(ALL_EMULATORS_STARTED_LOG);
    });

    this.cliProcess = cli;
    return started;
  }

  startEmulatorsAndWait(additionalArgs: string[], done: () => void): void {
    this.startExtEmulators(additionalArgs).then(done);
  }

  stopEmulators(done: () => void): void {
    const stopPromise = this.cliProcess?.stop();
    stopPromise?.then(done);
    if (!stopPromise) {
      done();
    }
  }

  invokeHttpFunction(
    name: string,
    done: (err: Error | null, res?: request.Response) => void
  ): void {
    const url =
      "http://localhost:" +
      [this.functionsEmulatorPort, FIREBASE_PROJECT, FIREBASE_PROJECT_ZONE, name].join("/");

    const req = request.get(url);

    req.on("response", function(response: request.Response) {
      response.body = "";
      response.on("data", (data) => {
        response.body += data.toString();
      });
      response.on("end", () => {
        done(null, response);
      });
    });

    req.once("error", function(err: Error) {
      done(err);
    });
  }

  waitForCondition(
    conditionFn: () => boolean,
    timeout: number,
    callback: (err?: Error) => void
  ): void {
    let elapsed = 0;
    const interval = 10;
    const id = setInterval(() => {
      elapsed += interval;
      if (elapsed > timeout) {
        clearInterval(id);
        callback(new Error(`Timed out waiting for condition: ${conditionFn.toString()}}`));
        return;
      }

      if (conditionFn()) {
        clearInterval(id);
        callback();
      }
    }, interval);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function readConfig(configPath: string, done: (err: any, conf?: Config) => any): void {
  fs.readFile(configPath, function(err: Error | null, data: Buffer) {
    if (err) {
      done(err);
      return;
    }
    let config;
    try {
      config = JSON.parse(data.toString());
    } catch (err) {
      done(err);
      return;
    }
    done(null, config);
  });
}

describe("extension emulator", function() {
  let test: TriggerEndToEndTest;

  before(function(done) {
    this.timeout(TEST_SETUP_TIMEOUT); // eslint-disable-line no-invalid-this

    expect(FIREBASE_PROJECT).to.not.be.an("undefined");
    expect(FIREBASE_PROJECT).to.not.be.null;

    async.series(
      [
        function(done: (err?: Error) => void) {
          readConfig(`${EXTENSION_ROOT}/${TEST_CONFIG_FILE}`, function(
            err: Error,
            config?: Config
          ) {
            if (err) {
              done(new Error("Error reading test config: " + err));
              return;
            }
            if (config) {
              test = new TriggerEndToEndTest(config);
            }
            done();
          });
        },
        function(done: (err?: Error) => void) {
          test.startEmulatorsAndWait(
            ["--test-params", "test-params.env", "--test-config", TEST_CONFIG_FILE],
            done
          );
        },
      ],
      done
    );
  });

  after(function(done) {
    this.timeout(EMULATORS_SHUTDOWN_DELAY_MS); // eslint-disable-line no-invalid-this
    if (test) {
      test.stopEmulators(done);
      return;
    }
    done();
  });

  it("should execute an HTTP function", function(done) {
    test.invokeHttpFunction(TEST_FUNCTION_NAME, function(
      err: Error | null,
      response?: request.Response
    ) {
      expect(response?.statusCode).to.equal(200);
      expect(response?.body).to.equal("Hello World from greet-the-world");
      done(err);
    });
  }).timeout(EMULATOR_TEST_TIMEOUT);
});
