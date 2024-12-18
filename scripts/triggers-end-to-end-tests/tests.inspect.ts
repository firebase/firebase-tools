import { expect } from "chai";
import * as fs from "fs";
import * as path from "path";

import { FrameworkOptions, TriggerEndToEndTest } from "../integration-helpers/framework";

const FIREBASE_PROJECT = process.env.FBTOOLS_TARGET_PROJECT || "";
/*
 * Various delays that are needed because this test spawns
 * parallel emulator subprocesses.
 */
const TEST_SETUP_TIMEOUT = 80000;
const EMULATORS_WRITE_DELAY_MS = 5000;
const EMULATORS_SHUTDOWN_DELAY_MS = 5000;

function readConfig(): FrameworkOptions {
  const filename = path.join(__dirname, "firebase.json");
  const data = fs.readFileSync(filename, "utf8");
  return JSON.parse(data);
}

describe("function triggers with inspect flag", () => {
  let test: TriggerEndToEndTest;

  before(async function (this) {
    this.timeout(TEST_SETUP_TIMEOUT);

    expect(FIREBASE_PROJECT).to.exist.and.not.be.empty;

    const config = readConfig();
    test = new TriggerEndToEndTest(FIREBASE_PROJECT, __dirname, config);
    await test.startEmulators(["--only", "functions,auth,storage", "--inspect-functions"]);
  });

  after(async function (this) {
    this.timeout(EMULATORS_SHUTDOWN_DELAY_MS);
    await test.stopEmulators();
  });

  describe("http functions", () => {
    it("should invoke correct function in the same codebase", async function (this) {
      this.timeout(TEST_SETUP_TIMEOUT);
      const v1response = await test.invokeHttpFunction("onreqv2b");
      expect(v1response.status).to.equal(200);
      const v1body = await v1response.text();
      expect(v1body).to.deep.equal("onreqv2b");

      const v2response = await test.invokeHttpFunction("onreqv2a");
      expect(v2response.status).to.equal(200);
      const v2body = await v2response.text();
      expect(v2body).to.deep.equal("onreqv2a");
    });

    it("should invoke correct function across codebases", async function (this) {
      this.timeout(TEST_SETUP_TIMEOUT);
      const v1response = await test.invokeHttpFunction("onReq");
      expect(v1response.status).to.equal(200);
      const v1body = await v1response.text();
      expect(v1body).to.deep.equal("onReq");

      const v2response = await test.invokeHttpFunction("onreqv2a");
      expect(v2response.status).to.equal(200);
      const v2body = await v2response.text();
      expect(v2body).to.deep.equal("onreqv2a");
    });

    it("should disable timeout", async function (this) {
      this.timeout(TEST_SETUP_TIMEOUT);
      const v2response = await test.invokeHttpFunction("onreqv2timeout");
      expect(v2response.status).to.equal(200);
      const v2body = await v2response.text();
      expect(v2body).to.deep.equal("onreqv2timeout");
    });
  });

  describe("event triggered (multicast) functions", () => {
    it("should trigger auth triggered functions in response to auth events", async function (this) {
      this.timeout(TEST_SETUP_TIMEOUT);
      const response = await test.writeToAuth();
      expect(response.status).to.equal(200);
      await new Promise((resolve) => setTimeout(resolve, EMULATORS_WRITE_DELAY_MS));
      expect(test.authTriggerCount).to.equal(1);
    });

    it("should trigger storage triggered functions in response to storage events across codebases", async function (this) {
      this.timeout(TEST_SETUP_TIMEOUT);

      const response = await test.writeToDefaultStorage();
      expect(response.status).to.equal(200);
      await new Promise((resolve) => setTimeout(resolve, EMULATORS_WRITE_DELAY_MS));

      expect(test.storageFinalizedTriggerCount).to.equal(1);
      expect(test.storageV2FinalizedTriggerCount).to.equal(1);
    });
  });
});
