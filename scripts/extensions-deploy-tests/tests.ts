import { expect } from "chai";
import * as subprocess from "child_process";
import { cli } from "winston/lib/winston/config";

import { CLIProcess } from "../integration-helpers/cli";

const FIREBASE_PROJECT = process.env.FBTOOLS_TARGET_PROJECT || "";

/*
 * Various delays that are needed because this test spawns
 * parallel emulator subprocesses.
 */
const TEST_SETUP_TIMEOUT = 600000;
const TEST_TIMEOUT = 50000;
describe("firebase deploy --only extensions", () => {
  let cli: CLIProcess;
  before(async function (this) {
    this.timeout(TEST_SETUP_TIMEOUT);

    expect(FIREBASE_PROJECT).to.exist.and.not.be.empty;

    // // TODO(joehan): Delete the --open-sesame call when extdev flag is removed.
    // const p = subprocess.spawnSync("firebase", ["--open-sesame", "extdev"], { cwd: __dirname });
    // console.log("open-sesame output:", p.stdout.toString());
    cli = new CLIProcess("default", __dirname);
    await cli.start(
      "deploy",
      FIREBASE_PROJECT,
      ["--only", "extensions", "--non-interactive", "--force"],
      (data: any) => {
        if (`${data}`.match(/Deploy complete/)) {
          return true;
        }
      }
    );
  });

  after(function (this) {
    this.timeout(TEST_TIMEOUT);
    cli.stop();
  });

  it("should have deployed the expected extensions", async function (this) {
    this.timeout(TEST_TIMEOUT);

    let output: any;
    await cli.start("ext:list", FIREBASE_PROJECT, ["--json"], (data: any) => {
      output = JSON.parse(data);
      return true;
    });

    expect(output.result.length).to.eq(2);
    expect(
      output.result.some(
        (i: any) =>
          i.instanceId === "test-instance1" &&
          i.extension === "firebase/firestore-bigquery-export" &&
          i.state === "ACTIVE"
      )
    ).to.be.true;
    expect(
      output.result.some(
        (i: any) =>
          i.instanceId === "test-instance2" &&
          i.extension === "firebase/storage-resize-images" &&
          i.state === "ACTIVE"
      )
    ).to.be.true;
  });
});
