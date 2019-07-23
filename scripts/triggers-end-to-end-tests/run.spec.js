#!/usr/bin/env node

const admin = require("firebase-admin");
const async = require("async");
const chai = require("chai");
const expect = chai.expect;
const assert = chai.assert;
const fs = require("fs");

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

/*
 * Various delays that are needed because this test spawns
 * parallel emulator subprocesses.
 */
const TEST_SETUP_TIMEOUT = 20000;
const EMULATORS_STARTUP_DELAY_MS = 10000;
const EMULATORS_WRITE_DELAY_MS = 5000;
const EMULATORS_SHUTDOWN_DELAY_MS = 5000;
const EMULATOR_TEST_TIMEOUT = EMULATORS_WRITE_DELAY_MS * 2;

/*
 * Realtime Database and Firestore documents we used to verify
 * bidirectional communication between the two via cloud functions.
 */
const FIRESTORE_COMPLETION_MARKER = "test/done_from_firestore";
const DATABASE_COMPLETION_MARKER = "test/done_from_database";

function TriggerEndToEndTest(config) {
  this.rtdb_emulator_host = "localhost";
  this.rtdb_emulator_port = config.emulators.database.port;

  this.firestore_emulator_host = "localhost";
  this.firestore_emulator_port = config.emulators.firestore.port;

  this.functions_emulator_host = "localhost";
  this.functions_emulator_port = config.emulators.functions.port;

  this.rtdb_trigger_count = 0;
  this.firestore_trigger_count = 0;

  this.rtdb_from_firestore = false;
  this.firestore_from_rtdb = false;

  this.rtdb_from_rtdb = false;
  this.firestore_from_firestore = false;

  this.emulators_process = null;
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

TriggerEndToEndTest.prototype.startEmulators = function startEmulators() {
  var self = this;
  self.emulators_process = subprocess.spawn("node", [
    PROJECT_ROOT + "/lib/bin/firebase.js",
    "emulators:start",
    "--project",
    FIREBASE_PROJECT,
  ]);

  self.emulators_process.stdout.on("data", function(data) {
    process.stdout.write("[emulators stdout] " + data);
    if (data.indexOf(RTDB_FUNCTION_LOG) > -1) {
      self.rtdb_trigger_count++;
    }
    if (data.indexOf(FIRESTORE_FUNCTION_LOG) > -1) {
      self.firestore_trigger_count++;
    }
  });

  self.emulators_process.stderr.on("data", function(data) {
    console.log("[emulators stderr] " + data);
  });
};

TriggerEndToEndTest.prototype.stopEmulators = function stopEmulators(done) {
  this.emulators_process.once("close", function(/* exitCode, signal */) {
    done();
  });

  /*
   * CLI process only shuts down emulators cleanly on SIGINT.
   */
  this.emulators_process.kill("SIGINT");
};

TriggerEndToEndTest.prototype.writeToRtdb = function writeToRtdb(done) {
  var url =
    "http://localhost:" +
    [this.functions_emulator_port, FIREBASE_PROJECT, FIREBASE_PROJECT_ZONE, "writeToRtdb"].join(
      "/"
    );

  const req = request.get(url);

  req.once("response", function(response) {
    done(null, response);
  });

  req.once("error", function(err) {
    done(err);
  });
};

TriggerEndToEndTest.prototype.writeToFirestore = function writeToFirestore(done) {
  var url =
    "http://localhost:" +
    [
      this.functions_emulator_port,
      FIREBASE_PROJECT,
      FIREBASE_PROJECT_ZONE,
      "writeToFirestore",
    ].join("/");

  const req = request.get(url);

  req.once("response", function(response) {
    done(null, response);
  });
  req.once("error", function(err) {
    done(err);
  });
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
          test.startEmulators();
          /*
           * Give some time for the emulator subprocesses to start up.
           */
          setTimeout(done, EMULATORS_STARTUP_DELAY_MS);
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

  after(function(done) {
    this.timeout(EMULATORS_SHUTDOWN_DELAY_MS);
    if (test) {
      test.stopEmulators(done);
      return;
    }
    done();
  });
});
