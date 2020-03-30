#!/usr/bin/env node

const admin = require("firebase-admin");
const async = require("async");
const chai = require("chai");
const expect = chai.expect;
const assert = chai.assert;
const fs = require("fs");
const os = require("os");

const Firestore = require("@google-cloud/firestore");

const path = require("path");
const request = require("request");
const subprocess = require("child_process");

const PROJECT_ROOT = path.dirname(path.dirname(path.dirname(__filename)));

const FIREBASE_PROJECT = process.env.FBTOOLS_TARGET_PROJECT;
const FIREBASE_PROJECT_ZONE = "us-central1";

/*
 * Markers this test looks for in the emulator process stdout
 * as one test for whether a cloud function was triggered.
 */
const RTDB_FUNCTION_LOG = "========== RTDB FUNCTION ==========";
const FIRESTORE_FUNCTION_LOG = "========== FIRESTORE FUNCTION ==========";
const PUBSUB_FUNCTION_LOG = "========== PUBSUB FUNCTION ==========";
const ALL_EMULATORS_STARTED_LOG = "All emulators started, it is now safe to connect.";

/*
 * Various delays that are needed because this test spawns
 * parallel emulator subprocesses.
 */
const TEST_SETUP_TIMEOUT = 60000;
const EMULATORS_WRITE_DELAY_MS = 5000;
const EMULATORS_SHUTDOWN_DELAY_MS = 5000;
const EMULATOR_TEST_TIMEOUT = EMULATORS_WRITE_DELAY_MS * 2;

/*
 * Realtime Database and Firestore documents we used to verify
 * bidirectional communication between the two via cloud functions.
 */
const FIRESTORE_COMPLETION_MARKER = "test/done_from_firestore";
const DATABASE_COMPLETION_MARKER = "test/done_from_database";

function CLIProcess(name) {
  this.name = name;
  this.process = undefined;
}
CLIProcess.prototype.constructor = CLIProcess;

CLIProcess.prototype.start = function(cmd, additionalArgs, logDoneFn) {
  const args = [PROJECT_ROOT + "/lib/bin/firebase.js", cmd, "--project", FIREBASE_PROJECT];

  if (additionalArgs) {
    args.push(...additionalArgs);
  }

  this.process = subprocess.spawn("node", args);

  this.process.stdout.on("data", (data) => {
    process.stdout.write(`[${this.name} stdout] ` + data);
  });

  this.process.stderr.on("data", (data) => {
    console.log(`[${this.name} stderr] ` + data);
  });

  let started;
  if (logDoneFn) {
    started = new Promise((resolve) => {
      this.process.stdout.on("data", (data) => {
        if (logDoneFn(data)) {
          resolve();
        }
      });
    });
  } else {
    started = new Promise((resolve) => {
      this.process.once("close", () => {
        this.process = undefined;
        resolve();
      });
    });
  }

  return started;
};

CLIProcess.prototype.stop = function() {
  if (!this.process) {
    return Promise.resolve();
  }

  const stopped = new Promise((resolve) => {
    this.process.once("close", (/* exitCode, signal */) => {
      this.process = undefined;
      resolve();
    });
  });

  this.process.kill("SIGINT");
  return stopped;
};

function TriggerEndToEndTest(config) {
  this.rtdb_emulator_host = "localhost";
  this.rtdb_emulator_port = config.emulators.database.port;

  this.firestore_emulator_host = "localhost";
  this.firestore_emulator_port = config.emulators.firestore.port;

  this.functions_emulator_host = "localhost";
  this.functions_emulator_port = config.emulators.functions.port;

  this.pubsub_emulator_host = "localhost";
  this.pubsub_emulator_port = config.emulators.pubsub.port;

  this.all_emulators_started = false;

  this.rtdb_trigger_count = 0;
  this.firestore_trigger_count = 0;
  this.pubsub_trigger_count = 0;

  this.rtdb_from_firestore = false;
  this.firestore_from_rtdb = false;

  this.rtdb_from_rtdb = false;
  this.firestore_from_firestore = false;

  this.cli_process = null;
}

/*
 * Check that all directions of database <-> functions <-> firestore
 * worked.
 */
TriggerEndToEndTest.prototype.success = function success() {
  return (
    this.rtdb_from_firestore &&
    this.rtdb_from_rtdb &&
    this.firestore_from_firestore &&
    this.firestore_from_rtdb
  );
};

TriggerEndToEndTest.prototype.startEmulators = function startEmulators(additionalArgs) {
  const cli = new CLIProcess("default");
  const started = cli.start("emulators:start", additionalArgs, (data) => {
    return data.indexOf(ALL_EMULATORS_STARTED_LOG) > -1;
  });

  cli.process.stdout.on("data", (data) => {
    if (data.indexOf(RTDB_FUNCTION_LOG) > -1) {
      this.rtdb_trigger_count++;
    }
    if (data.indexOf(FIRESTORE_FUNCTION_LOG) > -1) {
      this.firestore_trigger_count++;
    }
    if (data.indexOf(PUBSUB_FUNCTION_LOG) > -1) {
      this.pubsub_trigger_count++;
    }
  });

  this.cli_process = cli;
  return started;
};

TriggerEndToEndTest.prototype.startEmulatorsAndWait = function startEmulatorsAndWait(
  additionalArgs,
  done
) {
  this.startEmulators(additionalArgs).then(done);
};

TriggerEndToEndTest.prototype.stopEmulators = function stopEmulators(done) {
  this.cli_process.stop().then(done);
};

TriggerEndToEndTest.prototype.invokeHttpFunction = function invokeHttpFunction(name, done) {
  var url =
    "http://localhost:" +
    [this.functions_emulator_port, FIREBASE_PROJECT, FIREBASE_PROJECT_ZONE, name].join("/");

  const req = request.get(url);

  req.once("response", function(response) {
    done(null, response);
  });

  req.once("error", function(err) {
    done(err);
  });
};

TriggerEndToEndTest.prototype.writeToRtdb = function writeToRtdb(done) {
  return this.invokeHttpFunction("writeToRtdb", done);
};

TriggerEndToEndTest.prototype.writeToFirestore = function writeToFirestore(done) {
  return this.invokeHttpFunction("writeToFirestore", done);
};

TriggerEndToEndTest.prototype.writeToPubsub = function writeToPubsub(done) {
  return this.invokeHttpFunction("writeToPubsub", done);
};

TriggerEndToEndTest.prototype.writeToScheduledPubsub = function writeToScheduledPubsub(done) {
  return this.invokeHttpFunction("writeToScheduledPubsub", done);
};

TriggerEndToEndTest.prototype.waitForCondition = function(conditionFn, timeout, callback) {
  let elapsed = 0;
  let interval = 10;
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
};

function readConfig(done) {
  fs.readFile("firebase.json", function(err, data) {
    if (err) {
      done(err);
      return;
    }
    var config;
    try {
      config = JSON.parse(data);
    } catch (err) {
      done(err);
      return;
    }
    done(null, config);
  });
}

describe("database and firestore emulator function triggers", function() {
  var test;

  before(function(done) {
    this.timeout(TEST_SETUP_TIMEOUT);

    expect(FIREBASE_PROJECT).to.not.be.an("undefined");
    expect(FIREBASE_PROJECT).to.not.be.null;

    async.series(
      [
        function(done) {
          readConfig(function(err, config) {
            if (err) {
              done(new Error("error reading firebase.json: " + err));
              return;
            }
            test = new TriggerEndToEndTest(config);
            done();
          });
        },
        function(done) {
          test.startEmulatorsAndWait(["--only", "functions,database,firestore"], done);
        },
        function(done) {
          test.firestore_client = new Firestore({
            port: test.firestore_emulator_port,
            projectId: FIREBASE_PROJECT,
            servicePath: "localhost",
            ssl: false,
          });

          admin.initializeApp({
            projectId: FIREBASE_PROJECT,
            databaseURL: "http://localhost:" + test.rtdb_emulator_port + "?ns=" + FIREBASE_PROJECT,
            credential: {
              getAccessToken: () => {
                return Promise.resolve({
                  expires_in: 1000000,
                  access_token: "owner",
                });
              },
              getCertificate: () => {
                return {};
              },
            },
          });

          test.database_client = admin.database();
          done();
        },
        function(done) {
          const firestore = test.firestore_client;
          const database = test.database_client;

          /*
           * Install completion marker handlers and have them update state
           * in the global test fixture on success. We will later check that
           * state to determine whether the test passed or failed.
           */
          database.ref(FIRESTORE_COMPLETION_MARKER).on(
            "value",
            function(/* snap */) {
              test.rtdb_from_firestore = true;
            },
            function(err) {
              assert.fail(
                err,
                "Error reading " + FIRESTORE_COMPLETION_MARKER + " from database emulator."
              );
            }
          );

          database.ref(DATABASE_COMPLETION_MARKER).on(
            "value",
            function(/* snap */) {
              test.rtdb_from_rtdb = true;
            },
            function(err) {
              assert.fail(
                err,
                "Error reading " + DATABASE_COMPLETION_MARKER + " from database emulator."
              );
            }
          );

          firestore.doc(FIRESTORE_COMPLETION_MARKER).onSnapshot(
            function(/* snap */) {
              test.firestore_from_firestore = true;
            },
            function(err) {
              assert.fail(
                err,
                "Error reading " + FIRESTORE_COMPLETION_MARKER + " from firestore emulator."
              );
            }
          );

          firestore.doc(DATABASE_COMPLETION_MARKER).onSnapshot(
            function(/* snap */) {
              test.firestore_from_rtdb = true;
            },
            function(err) {
              assert.fail(
                err,
                "Error reading " + DATABASE_COMPLETION_MARKER + " from firestore emulator."
              );
            }
          );
          done();
        },
      ],
      done
    );
  });

  after(function(done) {
    this.timeout(EMULATORS_SHUTDOWN_DELAY_MS);
    if (test) {
      test.stopEmulators(done);
      return;
    }
    done();
  });

  it("should write to the database emulator", function(done) {
    this.timeout(EMULATOR_TEST_TIMEOUT);

    test.writeToRtdb(function(err, response) {
      expect(err).to.be.null;
      expect(response.statusCode).to.equal(200);
      done(err);
    });
  });

  it("should write to the firestore emulator", function(done) {
    this.timeout(EMULATOR_TEST_TIMEOUT);

    test.writeToFirestore(function(err, response) {
      expect(err).to.be.null;
      expect(response.statusCode).to.equal(200);

      /*
       * We delay again here because the functions triggered
       * by the previous two writes run parallel to this and
       * we need to give them and previous installed test
       * fixture state handlers to complete before we check
       * that state in the next test.
       */
      setTimeout(done, EMULATORS_WRITE_DELAY_MS);
    });
  });

  it("should have have triggered cloud functions", function(done) {
    expect(test.rtdb_trigger_count).to.equal(1);
    expect(test.firestore_trigger_count).to.equal(1);
    /*
     * Check for the presence of all expected documents in the firestore
     * and database emulators.
     */
    expect(test.success()).to.equal(true);
    done();
  });
});

describe("pubsub emulator function triggers", function() {
  var test;

  before(function(done) {
    this.timeout(TEST_SETUP_TIMEOUT);

    expect(FIREBASE_PROJECT).to.not.be.an("undefined");
    expect(FIREBASE_PROJECT).to.not.be.null;

    async.series(
      [
        function(done) {
          readConfig(function(err, config) {
            if (err) {
              done(new Error("error reading firebase.json: " + err));
              return;
            }
            test = new TriggerEndToEndTest(config);
            done();
          });
        },
        function(done) {
          test.startEmulatorsAndWait(["--only", "functions,pubsub"], done);
        },
      ],
      done
    );
  });

  after(function(done) {
    this.timeout(EMULATORS_SHUTDOWN_DELAY_MS);
    if (test) {
      test.stopEmulators(done);
      return;
    }
    done();
  });

  it("should write to the pubsub emulator", function(done) {
    this.timeout(EMULATOR_TEST_TIMEOUT);

    test.writeToPubsub(function(err, response) {
      expect(err).to.be.null;
      expect(response.statusCode).to.equal(200);
      setTimeout(done, EMULATORS_WRITE_DELAY_MS);
    });
  });

  it("should have have triggered cloud functions", function(done) {
    expect(test.pubsub_trigger_count).to.equal(1);
    done();
  });

  it("should write to the scheduled pubsub emulator", function(done) {
    this.timeout(EMULATOR_TEST_TIMEOUT);

    test.writeToScheduledPubsub(function(err, response) {
      expect(err).to.be.null;
      expect(response.statusCode).to.equal(200);
      setTimeout(done, EMULATORS_WRITE_DELAY_MS);
    });
  });

  it("should have have triggered cloud functions", function(done) {
    expect(test.pubsub_trigger_count).to.equal(2);
    done();
  });
});

describe("import/export end to end", () => {
  it("should be able to import/export firestore data", async () => {
    // Start up emulator suite
    const emulatorsCLI = new CLIProcess("1");
    await emulatorsCLI.start("emulators:start", ["--only", "firestore"], (data) => {
      return data.indexOf(ALL_EMULATORS_STARTED_LOG) > -1;
    });

    // Ask for export
    const exportCLI = new CLIProcess("2");
    const exportPath = fs.mkdtempSync(path.join(os.tmpdir(), "emulator-data"));
    await exportCLI.start("emulators:export", [exportPath]);

    // Stop the suite
    await emulatorsCLI.stop();

    // Attempt to import
    const importCLI = new CLIProcess("3");
    await importCLI.start(
      "emulators:start",
      ["--only", "firestore", "--import", exportPath],
      (data) => {
        return data.indexOf(ALL_EMULATORS_STARTED_LOG) > -1;
      }
    );

    await importCLI.stop();
  }).timeout(2 * TEST_SETUP_TIMEOUT);
});
