#!/usr/bin/env node
"use strict";

var expect = require("chai").expect;
var execSync = require("child_process").execSync;
var exec = require("child_process").exec;
var tmp = require("tmp");
var _ = require("lodash");
var fs = require("fs-extra");
var cloudfunctions = require("../lib/gcp/cloudfunctions");
var api = require("../lib/api");
var scopes = require("../lib/scopes");
var configstore = require("../lib/configstore");
var extractTriggers = require("../lib/extractTriggers");

var chalk = require("chalk");
var firebase = require("firebase");
var functions = require("firebase-functions");
var admin = require("firebase-admin");
var sinon = require("sinon");

var functionsSource = __dirname + "/assets/functions_to_test.js";
var projectDir = __dirname + "/test-project";
var projectId = "functions-integration-test";
var httpsTrigger = "https://us-central1-functions-integration-test.cloudfunctions.net/httpsAction";
var region = "us-central1";
var localFirebase = __dirname + "/../bin/firebase";
var TIMEOUT = 40000;
var tmpDir;
var app;

var parseFunctionsList = function() {
  var configStub = sinon.stub(functions, "config").returns({
    firebase: {
      databaseURL: "https://not-a-project.firebaseio.com",
      storageBucket: "not-a-project.appspot.com",
    },
  });
  var adminStub = sinon.stub(admin, "initializeApp");
  var triggers = [];
  extractTriggers(require(functionsSource), triggers);
  configStub.restore();
  adminStub.restore();
  return _.map(triggers, "name");
};

var getUuid = function() {
  return Math.floor(Math.random() * 100000000000).toString();
};

var preTest = function() {
  var dir = tmp.dirSync({ prefix: "fntest_" });
  tmpDir = dir.name;
  fs.copySync(projectDir, tmpDir);
  execSync("npm install", { cwd: tmpDir + "/functions" });
  api.setRefreshToken(configstore.get("tokens").refresh_token);
  api.setScopes(scopes.CLOUD_PLATFORM);
  var config = {
    apiKey: "AIzaSyCLgng7Qgzf-2UKRPLz--LtLLxUsMK8oco",
    authDomain: "functions-integration-test.firebaseapp.com",
    databaseURL: "https://functions-integration-test.firebaseio.com",
    storageBucket: "functions-integration-test.appspot.com",
  };
  app = firebase.initializeApp(config);
  console.log("Done pretest prep.");
};

var postTest = function() {
  fs.remove(tmpDir);
  execSync(localFirebase + " database:remove / -y", { cwd: tmpDir });
  console.log("Done post-test cleanup.");
  process.exit();
};

var checkFunctionsListMatch = function(expectedFunctions) {
  return cloudfunctions
    .list(projectId, region)
    .then(function(result) {
      var deployedFunctions = _.map(result, "functionName");
      expect(_.isEmpty(_.xor(expectedFunctions, deployedFunctions))).to.be.true;
      return true;
    })
    .catch(function(err) {
      expect(err).to.be.null;
    });
};

var testCreateUpdate = function() {
  fs.copySync(functionsSource, tmpDir + "/functions/index.js");
  return new Promise(function(resolve) {
    exec(localFirebase + " deploy", { cwd: tmpDir }, function(err, stdout) {
      console.log(stdout);
      expect(err).to.be.null;
      resolve(checkFunctionsListMatch(parseFunctionsList()));
    });
  });
};

var testCreateUpdateWithFilter = function() {
  fs.copySync(functionsSource, tmpDir + "/functions/index.js");
  return new Promise(function(resolve) {
    exec(
      localFirebase + " deploy --only functions:dbAction,functions:httpsAction",
      { cwd: tmpDir },
      function(err, stdout) {
        console.log(stdout);
        expect(err).to.be.null;
        resolve(checkFunctionsListMatch(["dbAction", "httpsAction"]));
      }
    );
  });
};

var testDelete = function() {
  return new Promise(function(resolve) {
    exec("> functions/index.js &&" + localFirebase + " deploy", { cwd: tmpDir }, function(
      err,
      stdout
    ) {
      console.log(stdout);
      expect(err).to.be.null;
      resolve(checkFunctionsListMatch([]));
    });
  });
};

var testDeleteWithFilter = function() {
  return new Promise(function(resolve) {
    exec(
      "> functions/index.js &&" + localFirebase + " deploy --only functions:dbAction",
      { cwd: tmpDir },
      function(err, stdout) {
        console.log(stdout);
        expect(err).to.be.null;
        resolve(checkFunctionsListMatch(["httpsAction"]));
      }
    );
  });
};

var testUnknownFilter = function() {
  return new Promise(function(resolve) {
    exec(
      "> functions/index.js &&" + localFirebase + " deploy --only functions:unknownFilter",
      { cwd: tmpDir },
      function(err, stdout) {
        console.log(stdout);
        expect(stdout).to.contain(
          "the following filters were specified but do not match any functions in the project: unknownFilter"
        );
        expect(err).to.be.null;
        resolve(checkFunctionsListMatch(["httpsAction"]));
      }
    );
  });
};

var waitForAck = function(uuid, testDescription) {
  return Promise.race([
    new Promise(function(resolve) {
      var ref = firebase
        .database()
        .ref("output")
        .child(uuid);
      var listener = ref.on("value", function(snap) {
        if (snap.exists()) {
          ref.off("value", listener);
          resolve();
        }
      });
    }),
    new Promise(function(resolve, reject) {
      setTimeout(function() {
        reject("Timed out while waiting for output from " + testDescription);
      }, TIMEOUT);
    }),
  ]);
};

var writeToDB = function(path) {
  var uuid = getUuid();
  return app
    .database()
    .ref(path)
    .child(uuid)
    .set({ foo: "bar" })
    .then(function() {
      return Promise.resolve(uuid);
    });
};

var sendHttpRequest = function(message) {
  return api
    .request("POST", httpsTrigger, {
      data: message,
      origin: "",
    })
    .then(function(resp) {
      expect(resp.status).to.equal(200);
      expect(resp.body).to.deep.equal(message);
    });
};

var publishPubsub = function(topic) {
  var uuid = getUuid();
  var message = new Buffer(uuid).toString("base64");
  return api
    .request("POST", "/v1/projects/functions-integration-test/topics/" + topic + ":publish", {
      auth: true,
      data: {
        messages: [{ data: message }],
      },
      origin: "https://pubsub.googleapis.com",
    })
    .then(function(resp) {
      expect(resp.status).to.equal(200);
      return Promise.resolve(uuid);
    });
};

var saveToStorage = function() {
  var uuid = getUuid();
  var contentLength = Buffer.byteLength(uuid, "utf8");
  var resource = ["b", projectId + ".appspot.com", "o"].join("/");
  var endpoint = "/upload/storage/v1/" + resource + "?uploadType=media&name=" + uuid;
  return api
    .request("POST", endpoint, {
      auth: true,
      headers: {
        "Content-Type": "text/plain",
        "Content-Length": contentLength,
      },
      data: uuid,
      json: false,
      origin: api.googleOrigin,
    })
    .then(function(resp) {
      expect(resp.status).to.equal(200);
      return Promise.resolve(uuid);
    });
};

var testFunctionsTrigger = function() {
  var checkDbAction = writeToDB("input").then(function(uuid) {
    return waitForAck(uuid, "database triggered function");
  });
  var checkNestedDbAction = writeToDB("inputNested").then(function(uuid) {
    return waitForAck(uuid, "nested database triggered function");
  });
  var checkHttpsAction = sendHttpRequest({ message: "hello" });
  var checkPubsubAction = publishPubsub("topic1").then(function(uuid) {
    return waitForAck(uuid, "pubsub triggered function");
  });
  var checkGcsAction = saveToStorage().then(function(uuid) {
    return waitForAck(uuid, "storage triggered function");
  });
  return Promise.all([
    checkDbAction,
    checkNestedDbAction,
    checkHttpsAction,
    checkPubsubAction,
    checkGcsAction,
  ]);
};

var main = function() {
  preTest();
  testCreateUpdate()
    .then(function() {
      console.log(chalk.green("\u2713 Test passed: creating functions"));
      return testCreateUpdate();
    })
    .then(function() {
      console.log(chalk.green("\u2713 Test passed: updating functions"));
      return testFunctionsTrigger();
    })
    .then(function() {
      console.log(chalk.green("\u2713 Test passed: triggering functions"));
      return testDelete();
    })
    .then(function() {
      console.log(chalk.green("\u2713 Test passed: deleting functions"));
      return testCreateUpdateWithFilter();
    })
    .then(function() {
      console.log(chalk.green("\u2713 Test passed: creating functions with filters"));
      return testDeleteWithFilter();
    })
    .then(function() {
      console.log(chalk.green("\u2713 Test passed: deleting functions with filters"));
      return testUnknownFilter();
    })
    .then(function() {
      console.log(
        chalk.green("\u2713 Test passed: threw warning when passing filter with unknown identifier")
      );
    })
    .catch(function(err) {
      console.log(chalk.red("Error while running tests: "), err);
      return Promise.resolve();
    })
    .then(postTest);
};

main();
