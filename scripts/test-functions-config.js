#!/usr/bin/env node
"use strict";

/**
 * Integration test for functions config commands. Run:
 * node ./test-functions-config.js <projectId>
 *
 * If parameter ommited:
 * - projectId defaults to `functions-integration-test`
 */

var clc = require("colorette");
var exec = require("child_process").exec;
var execSync = require("child_process").execSync;
var expect = require("chai").expect;
var fs = require("fs-extra");
var tmp = require("tmp");

var api = require("../lib/api");
var scopes = require("../lib/scopes");

var projectId = process.argv[2] || "functions-integration-test";
var localFirebase = __dirname + "/../lib/bin/firebase.js";
var projectDir = __dirname + "/test-project";
var tmpDir;

var preTest = function () {
  var dir = tmp.dirSync({ prefix: "cfgtest_" });
  tmpDir = dir.name;
  fs.copySync(projectDir, tmpDir);
  api.setScopes(scopes.CLOUD_PLATFORM);
  execSync(`${localFirebase} functions:config:unset foo --project=${projectId}`, { cwd: tmpDir });
  console.log("Done pretest prep.");
};

var postTest = function () {
  fs.remove(tmpDir);
  console.log("Done post-test cleanup.");
};

var set = function (expression) {
  return new Promise(function (resolve) {
    exec(
      `${localFirebase} functions:config:set ${expression} --project=${projectId}`,
      { cwd: tmpDir },
      function (err) {
        expect(err).to.be.null;
        resolve();
      },
    );
  });
};

var unset = function (key) {
  return new Promise(function (resolve) {
    exec(
      `${localFirebase} functions:config:unset ${key} --project=${projectId}`,
      { cwd: tmpDir },
      function (err) {
        expect(err).to.be.null;
        resolve();
      },
    );
  });
};

var getAndCompare = function (expected) {
  return new Promise(function (resolve) {
    exec(
      `${localFirebase} functions:config:get --project=${projectId}`,
      { cwd: tmpDir },
      function (err, stdout) {
        expect(JSON.parse(stdout)).to.deep.equal(expected);
        resolve();
      },
    );
  });
};

var runTest = function (description, expression, key, expected) {
  return set(expression)
    .then(function () {
      return getAndCompare(expected);
    })
    .then(function () {
      return unset(key);
    })
    .then(function () {
      console.log(clc.green("\u2713 Test passed: ") + description);
    });
};

var main = function () {
  preTest();
  runTest("string value", "foo.bar=faz", "foo", { foo: { bar: "faz" } })
    .then(function () {
      return runTest("string value in quotes", 'foo.bar="faz"', "foo", {
        foo: { bar: "faz" },
      });
    })
    .then(function () {
      return runTest("string value with quotes", "foo.bar='\"faz\"'", "foo", {
        foo: { bar: '"faz"' },
      });
    })
    .then(function () {
      return runTest("single-part key and JSON value", 'foo=\'{"bar":"faz"}\'', "foo", {
        foo: { bar: "faz" },
      });
    })
    .then(function () {
      return runTest("multi-part key and JSON value", 'foo.too=\'{"bar":"faz"}\'', "foo", {
        foo: { too: { bar: "faz" } },
      });
    })
    .then(function () {
      return runTest("numeric value", "foo.bar=123", "foo", {
        foo: { bar: "123" },
      });
    })
    .then(function () {
      return runTest("numeric value in quotes", 'foo.bar="123"', "foo", {
        foo: { bar: "123" },
      });
    })
    .then(function () {
      return runTest("null value", "foo.bar=null", "foo", {
        foo: { bar: "null" },
      });
    })
    .catch(function (err) {
      console.log(clc.red("Error while running tests: "), err);
      return Promise.resolve();
    })
    .then(postTest);
};

main();
