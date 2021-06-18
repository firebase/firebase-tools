#!/usr/bin/env node
"use strict";

/**
 * Integration test for functions config commands. Run:
 * node ./test-functions-env.js <projectId> <region>
 *
 * If parameter ommited:
 * - projectId defaults to `functions-integration-test`
 * - region defaults to `us-central1`
 */

const expect = require("chai").expect;
const execSync = require("child_process").execSync;
const fs = require("fs-extra");
const util = require("util");
var tmp = require("tmp");

const exec = util.promisify(require("child_process").exec);

const api = require("../lib/api");
const cloudfunctions = require("../lib/gcp/cloudfunctions");
const { configstore } = require("../lib/configstore");
const scopes = require("../lib/scopes");

const functionsSource = __dirname + "/assets/functions_to_test.js";
const functionTarget = "httpsAction";
const projectId = process.argv[2] || "functions-integration-test";
const region = process.argv[3] || "us-central1";
const localFirebase = __dirname + "/../lib/bin/firebase.js";
const projectDir = __dirname + "/test-project";
let tmpDir;

function preTest() {
  const dir = tmp.dirSync({ prefix: "envtest_" });
  tmpDir = dir.name;
  fs.copySync(projectDir, tmpDir);
  execSync("npm install", { cwd: tmpDir + "/functions", stdio: "ignore", stderr: "ignore" });
  api.setRefreshToken(configstore.get("tokens").refresh_token);
  api.setScopes(scopes.CLOUD_PLATFORM);
  execSync(`${localFirebase} functions:env:clear --project=${projectId}`, { cwd: tmpDir });
  console.log("Done pretest prep.");
  fs.copySync(functionsSource, tmpDir + "/functions/index.js");
}

function postTest() {
  fs.remove(tmpDir);
  execSync(`${localFirebase} functions:delete ${functionTarget}`);
  console.log("Done post-test cleanup.");
}

function cmdFn(cmd) {
  return async () => {
    console.log(`running command: firebase ${cmd}`);
    await exec(`${localFirebase} ${cmd} --project=${projectId} -f`, {
      cwd: tmpDir,
    });
  };
}

function set(expression) {
  return cmdFn(`functions:env:set ${expression}`);
}

function add(expression) {
  return cmdFn(`functions:env:add ${expression}`);
}

function clear() {
  return cmdFn(`functions:env:clear`);
}

function remove(expression) {
  return cmdFn(`functions:env:remove ${expression}`);
}

async function expectEnvs(envs) {
  const fns = await cloudfunctions.listFunctions(projectId, region);
  const fn = fns.find((fn) => fn.name.includes(functionTarget));

  const { FIREBASE_CONFIG: firebaseConfig, ...gotEnvs } = fn.environmentVariables;

  expect(firebaseConfig).to.not.be.null;
  expect(gotEnvs).to.be.deep.equals(envs);
  console.log("PASS");
}

async function deployAndCompare(expected) {
  await cmdFn(`deploy --only functions:${functionTarget}`)();
  await expectEnvs(expected);
}

async function runTest(description, cmds, expected) {
  console.log("============================");
  console.log(`Running test: ${description}`);
  for (const cmd of cmds) {
    await cmd();
  }
  await deployAndCompare(expected);
  await clear()();
  console.log("============================");
}

async function main() {
  preTest();
  await runTest("set", [set("FOO=foo BAR=bar CAR=car")], { FOO: "foo", BAR: "bar", CAR: "car" });
  await runTest("set, add", [set("FOO=foo BAR=bar"), add("CAR=car")], {
    FOO: "foo",
    BAR: "bar",
    CAR: "car",
  });
  await runTest("set, add, remove", [set("FOO=foo BAR=bar"), add("CAR=car"), remove("FOO")], {
    BAR: "bar",
    CAR: "car",
  });
  await runTest("set, clear", [set("FOO=foo BAR=bar"), clear()], {});
}

main()
  .then(() => {
    console.log("success");
  })
  .catch((err) => {
    console.log(err);
  })
  .then(() => {
    postTest();
  });
