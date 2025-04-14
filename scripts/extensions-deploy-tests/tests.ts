import { expect } from "chai";

import { CLIProcess } from "../integration-helpers/cli";

const FIREBASE_PROJECT = process.env.FBTOOLS_TARGET_PROJECT || "";

const TEST_SETUP_TIMEOUT_MS = 10000;
const TEST_TIMEOUT_MS = 600000;

describe("firebase deploy --only extensions", () => {
  let cli: CLIProcess;
  before(function (this) {
    this.timeout(TEST_SETUP_TIMEOUT_MS);
    expect(FIREBASE_PROJECT).to.exist.and.not.be.empty;
    cli = new CLIProcess("default", __dirname);
  });

  after(() => {
    cli.stop();
  });

  it("should have deployed the expected extensions", async function (this) {
    this.timeout(TEST_TIMEOUT_MS);

    await cli.start(
      "deploy",
      FIREBASE_PROJECT,
      ["--only", "extensions", "--non-interactive", "--force"],
      (data: any) => {
        if (`${data}`.match(/Deploy complete/)) {
          return true;
        }
      },
    );
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
          i.state === "ACTIVE",
      ),
    ).to.be.true;
    expect(
      output.result.some(
        (i: any) =>
          i.instanceId === "test-instance2" &&
          i.extension === "firebase/storage-resize-images" &&
          i.state === "ACTIVE",
      ),
    ).to.be.true;
  });
});
