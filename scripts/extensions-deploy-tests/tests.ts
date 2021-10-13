import { expect } from "chai";
import * as subprocess from "child_process";

import { CLIProcess } from "../integration-helpers/cli"};

const FIREBASE_PROJECT = process.env.FBTOOLS_TARGET_PROJECT || "";

/*
 * Various delays that are needed because this test spawns
 * parallel emulator subprocesses.
 */
const TEST_SETUP_TIMEOUT = 60000;

describe("extension emulator", () => {

  before(async function (this) {
    this.timeout(TEST_SETUP_TIMEOUT);

    expect(FIREBASE_PROJECT).to.exist.and.not.be.empty;

    // // TODO(joehan): Delete the --open-sesame call when extdev flag is removed.
    // const p = subprocess.spawnSync("firebase", ["--open-sesame", "extdev"], { cwd: __dirname });
    // console.log("open-sesame output:", p.stdout.toString());
    const cli = new CLIProcess("default", "");
    await cli.start("firebase deploy", FIREBASE_PROJECT, ["--only", "extensions"], console.log)
  });

  it("should execute an HTTP function", async function (this) {
    this.timeout(EMULATORS_SHUTDOWN_DELAY_MS);

    const res = await test.invokeHttpFunction(TEST_FUNCTION_NAME, FIREBASE_PROJECT_ZONE);

    expect(res.status).to.equal(200);
    await expect(res.text()).to.eventually.equal("Hello World from greet-the-world");
  });
});
