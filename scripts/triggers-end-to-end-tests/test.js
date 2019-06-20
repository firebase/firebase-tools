#!/usr/bin/env node

var admin = require("firebase-admin");
var fs = require("fs");

var Firestore = require("@google-cloud/firestore");
var grpc = require("@grpc/grpc-js");

var path = require("path");
var request = require("request");
var subprocess = require("child_process");

var PROJECT_ROOT = path.dirname(path.dirname(path.dirname(__filename)));
var FIREBASE_PROJECT = "fir-tools-testing";
var FIREBASE_PROJECT_ZONE = "us-central1";

var RTDB_FUNCTION_LOG = "========== RTDB FUNCTION ==========";
var FIRESTORE_FUNCTION_LOG = "========== FIRESTORE FUNCTION ==========";

var EMULATORS_STARTUP_DELAY_MS = 7000;
var EMULATORS_WRITE_DELAY_MS = 5000;

var FIRESTORE_COMPLETION_MARKER = "test/done_from_firestore";
var DATABASE_COMPLETION_MARKER = "test/done_from_database";

function TriggerEndToEndTest(config)
{
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
TriggerEndToEndTest.prototype.success = function success()
{
  return this.rtdb_from_firestore &&
      this.rtdb_from_rtdb &&
      this.firestore_from_firestore &&
      this.firestore_from_rtdb;
};

TriggerEndToEndTest.prototype.startEmulators = function startEmulators()
{
  var self = this;
  self.emulators_process = subprocess.spawn("node", [
      PROJECT_ROOT + "/lib/bin/firebase.js",
      "emulators:start",
      "--project",
      FIREBASE_PROJECT
  ]);

  self.emulators_process.stdout.on("data", function (data) {
    process.stdout.write("[emulators stdout] " + data);
    if (data.indexOf(RTDB_FUNCTION_LOG) > -1) {
      self.rtdb_trigger_count++;
    }
    if (data.indexOf(FIRESTORE_FUNCTION_LOG) > -1) {
      self.firestore_trigger_count++;
    }
  });

  self.emulators_process.stderr.on("data", function (data) {
    console.log("[emulators stderr] " + data);
  });
}

TriggerEndToEndTest.prototype.stopEmulators = function stopEmulators()
{
  var self = this;

  return new Promise(function (resolve, reject) {
    self.emulators_process.on('close', function (exitCode, signal) {
      resolve();
    });

    /*
     * CLI process only shuts down emulators cleanly on SIGINT.
     */
    self.emulators_process.kill("SIGINT");
  });
}

TriggerEndToEndTest.prototype.writeToRtdb = function writeToRtdb()
{
  var self = this;

  return new Promise(function (resolve, reject) {
    var url = "http://localhost:" + [
        self.functions_emulator_port,
        FIREBASE_PROJECT,
        FIREBASE_PROJECT_ZONE,
        "writeToRtdb"
    ].join("/");

    request.get(url).on('response', function(response) {
      if (response.statusCode === 200) {
        resolve();
      } else {
        reject();
      }
    });
  });
};

TriggerEndToEndTest.prototype.writeToFirestore = function writeToFirestore()
{
  var self = this;

  return new Promise(function (resolve, reject) {
    var url = "http://localhost:" + [
        self.functions_emulator_port,
        FIREBASE_PROJECT,
        FIREBASE_PROJECT_ZONE,
        "writeToFirestore"
    ].join("/");

    request.get(url).on('response', function(response) {
      if (response.statusCode === 200) {
        resolve();
      } else {
        reject();
      }
    });
  });
};

function sleep(ms)
{
  return new Promise(function (resolve, reject) {
    setTimeout(resolve, ms);
  });
}

function readConfig(done)
{
  fs.readFile("firebase.json", function (err, data) {
    if (err) {
      console.log("unable to read firebase.json " + err);
      done(err);
      return;
    }
    var config;
    try {
      config = JSON.parse(data);
    } catch (err) {
      console.log("malformed firebase.json " + err);
    }
    done(null, config);
  });
}

function runTest(config)
{
  var test = new TriggerEndToEndTest(config);
  test.startEmulators();

  sleep(EMULATORS_STARTUP_DELAY_MS).then(function () {
    var firestore = new Firestore({
      port: test.firestore_emulator_port,
      projectId: FIREBASE_PROJECT,
      servicePath: 'localhost',
      ssl: false
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
        }
      }
    });

    admin.database().ref(FIRESTORE_COMPLETION_MARKER).on("value", function (snap) {
      test.rtdb_from_firestore = true;
    }, function (err) {
      console.log("error reading " + FIRESTORE_COMPLETION_MARKER + " from database emulator: " + err);
    });

    admin.database().ref(DATABASE_COMPLETION_MARKER).on("value", function (snap) {
      test.rtdb_from_rtdb = true;
    }, function (err) {
      console.log("error reading " + DATABASE_COMPLETION_MARKER + " from database emulator: " + err);
    });

    firestore.doc(FIRESTORE_COMPLETION_MARKER).onSnapshot(function (snap) {
      test.firestore_from_firestore = true;
    }, function (err) {
      console.log("error reading " + FIRESTORE_COMPLETION_MARKER + " from firestore emulator: " + err);
    });

    firestore.doc(DATABASE_COMPLETION_MARKER).onSnapshot(function (snap) {
      test.firestore_from_rtdb = true;
    }, function (err) {
      console.log("error reading " + DATABASE_COMPLETION_MARKER + " from firestore emulator: " + err);
    });

  }).then(function () {
    return test.writeToRtdb();
  }).then(function () {
    return test.writeToFirestore();
  }).then(function () {
    return sleep(EMULATORS_WRITE_DELAY_MS);
  }).then(function () {
    var failed = 0;
    if (test.rtdb_trigger_count != 1) {
      failed++;
      if (test.rtdb_trigger_count === 0) {
        console.log("[failed] RTDB triggered function did not run!");
      }
      if (test.rtdb_trigger_count > 1) {
        console.log("[failed] RTDB triggered function ran " + test.rtdb_trigger_count + " times. " +
            "Expected only a single run.");
      }
    } else {
      console.log("[success] RTDB write triggered function call.");
    }
    if (test.firestore_trigger_count != 1) {
      failed++;
      if (test.firestore_trigger_count === 0) {
        console.log("[failed] Firestore triggered function did not run!");
      }
      if (test.firestore_trigger_count > 1) {
        console.log("[failed] Firestore triggered function ran " + test.firestore_trigger_count + " times." +
            "Expected only a single run.");
      }
    } else {
      console.log("[success] Firestore write triggered function call.");
    }

    if (test.success()) {
      console.log("[success] Bidirectional communication between firestore/database emulators and " +
          "functions emulator works!");
    } else {
      console.log("[failed] Bidirectional communication between firestore/database emulators and " +
          "functions emulator is broken. See logs above for more details.");
    }

    test.stopEmulators().then(function () {
      if (failed > 0) {
        process.exit(1);
      }
      process.exit(0);
    })
  });
}

function main()
{
  readConfig(function (err, config) {
    if (err) {
      process.exit(1);
    }
    runTest(config);
  });
}

main();
