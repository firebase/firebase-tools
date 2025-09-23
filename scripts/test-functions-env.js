#!/usr/bin/env node
"use strict";

/**
 * Integration test for functions env var support. Run:
 * node ./test-functions-env.js <projectId> <region>
 *
 * If parameter ommited:
 * - projectId defaults to `functions-integration-test`
 * - region defaults to `us-central1`
 */

const expect = require("chai").expect;
const execSync = require("child_process").execSync;
const fs = require("fs-extra");
const path = require("path");
const tmp = require("tmp");

const api = require("../lib/api");
const cloudfunctions = require("../lib/gcp/cloudfunctions");
const { configstore } = require("../lib/configstore");
const scopes = require("../lib/scopes");

const source = __dirname + "/assets/functions_to_test_minimal.js";
const functionTarget = "httpsAction";
const projectId = process.argv[2] || "functions-integration-test";
const region = process.argv[3] || "us-central1";
const localFirebase = __dirname + "/../lib/bin/firebase.js";
const projectDir = __dirname + "/test-project";

let tmpDir;
let functionsSource;

function preTest() {
  const dir = tmp.dirSync({ prefix: "envtest_" });
  tmpDir = dir.name;
  functionsSource = tmpDir + "/functions";
  fs.copySync(projectDir, tmpDir);
  execSync("npm install", { cwd: functionsSource, stdio: "ignore", stderr: "ignore" });
  api.setRefreshToken(configstore.get("tokens").refresh_token);
  api.setScopes(scopes.CLOUD_PLATFORM);
  fs.copySync(source, functionsSource + "/index.js");
  execSync(`${localFirebase} --open-sesame dotenv`, { cwd: tmpDir });
  console.log("Done pretest prep.");
}

function postTest() {
  fs.remove(tmpDir);
  execSync(`${localFirebase} functions:delete ${functionTarget} --project=${projectId} -f`);
  console.log("Done post-test cleanup.");
}

async function expectEnvs(envs) {
  const fns = await cloudfunctions.listFunctions(projectId, region);
  const fn = fns.find((fn) => fn.name.includes(functionTarget));

  const gotEnvs = fn.environmentVariables;
  // Remove system-provided environment variables.
  delete gotEnvs.GCLOUD_PROJECT;
  delete gotEnvs.FIREBASE_CONFIG;

  expect(gotEnvs).to.be.deep.equals(envs);
  console.log("PASS");
}

async function deployAndCompare(expected) {
  execSync(`${localFirebase} deploy --only functions --project=${projectId}`, { cwd: tmpDir });
  await expectEnvs(expected);
}

async function runTest(description, envFiles, expected) {
  console.log("============================");
  console.log(`Running test: ${description}`);

  const toCleanup = [];
  for (const [targetFile, data] of Object.entries(envFiles)) {
    const fullPath = path.join(functionsSource, targetFile);
    fs.writeFileSync(fullPath, data);
    toCleanup.push(fullPath);
  }
  try {
    await deployAndCompare(expected);
  } finally {
    for (const f of toCleanup) {
      fs.unlinkSync(f);
    }
  }
}

(async () => {
  try {
    preTest();
    await runTest(
      "Inject environment variables from .env",
      { ".env": "FOO=foo\nBAR=bar\nCAR=car" },
      { FOO: "foo", BAR: "bar", CAR: "car" },
    );
    await runTest(
      "Inject environment variables from .env and .env.<project>",
      { ".env": "FOO=foo\nSOURCE=env", [`.env.${projectId}`]: "SOURCE=env-project" },
      { FOO: "foo", SOURCE: "env-project" },
    );
    console.log("Success");
  } catch (err) {
    console.log("Error: " + err);
  } finally {
    postTest();
  }
})();
