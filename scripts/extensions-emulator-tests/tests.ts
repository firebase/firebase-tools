import { expect } from "chai";
import * as fs from "fs";
import * as path from "path";
import * as subprocess from "child_process";

import { FrameworkOptions, TriggerEndToEndTest } from "../integration-helpers/framework";

const EXTENSION_ROOT = path.dirname(__filename) + "/greet-the-world";

const FIREBASE_PROJECT = process.env.FBTOOLS_TARGET_PROJECT || "";
const FIREBASE_PROJECT_ZONE = "us-east1";
const TEST_CONFIG_FILE = "test-firebase.json";
const TEST_FUNCTION_NAME = "greetTheWorld";

/*
 * Various delays that are needed because this test spawns
 * parallel emulator subprocesses.
 */
const TEST_SETUP_TIMEOUT = 60000;
const EMULATORS_SHUTDOWN_DELAY_MS = 5000;

function readConfig(): FrameworkOptions {
  const filename = path.join(EXTENSION_ROOT, "test-firebase.json");
  const data = fs.readFileSync(filename, "utf8");
  return JSON.parse(data);
}

describe("extension emulator", () => {
  let test: TriggerEndToEndTest;

  before(async function (this) {
    this.timeout(TEST_SETUP_TIMEOUT);

    expect(FIREBASE_PROJECT).to.exist.and.not.be.empty;

    // TODO(joehan): Delete the --open-sesame call when extdev flag is removed.
    const p = subprocess.spawnSync("firebase", ["--open-sesame", "extdev"], { cwd: __dirname });
    console.log("open-sesame output:", p.stdout.toString());

    test = new TriggerEndToEndTest(FIREBASE_PROJECT, EXTENSION_ROOT, readConfig());
    await test.startExtEmulators([
      "--test-params",
      "test-params.env",
      "--test-config",
      TEST_CONFIG_FILE,
    ]);
  });

  after(async function (this) {
    this.timeout(EMULATORS_SHUTDOWN_DELAY_MS);
    await test.stopEmulators();
  });

  it("should execute an HTTP function", async function (this) {
    this.timeout(EMULATORS_SHUTDOWN_DELAY_MS);

    const res = await test.invokeHttpFunction(TEST_FUNCTION_NAME, FIREBASE_PROJECT_ZONE);

    expect(res.status).to.equal(200);
    await expect(res.text()).to.eventually.equal("Hello World from greet-the-world");
  });
});
