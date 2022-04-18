import { expect } from "chai";
import * as admin from "firebase-admin";
import * as fs from "fs";
import * as rimraf from "rimraf";
import * as path from "path";

import { FrameworkOptions, TriggerEndToEndTest } from "../integration-helpers/framework";

const FIREBASE_PROJECT = process.env.FBTOOLS_TARGET_PROJECT || "";

/*
 * Various delays that are needed because this test spawns
 * parallel emulator subprocesses.
 */
const TEST_SETUP_TIMEOUT = 120000;
const EMULATORS_WRITE_DELAY_MS = 5000;
const EMULATORS_SHUTDOWN_DELAY_MS = 25000;
const EMULATOR_TEST_TIMEOUT = EMULATORS_WRITE_DELAY_MS * 2;
const STORAGE_RESIZED_FILE_NAME = "test_200x200.png";

function setUpExtensionsCache(): void {
  process.env.FIREBASE_EXTENSIONS_CACHE_PATH = path.join(__dirname, "cache");
  cleanUpExtensionsCache();
  fs.mkdirSync(process.env.FIREBASE_EXTENSIONS_CACHE_PATH);
}

function cleanUpExtensionsCache(): void {
  if (
    process.env.FIREBASE_EXTENSIONS_CACHE_PATH &&
    fs.existsSync(process.env.FIREBASE_EXTENSIONS_CACHE_PATH)
  ) {
    rimraf.sync(process.env.FIREBASE_EXTENSIONS_CACHE_PATH);
  }
}

function readConfig(): FrameworkOptions {
  const filename = path.join(__dirname, "firebase.json");
  const data = fs.readFileSync(filename, "utf8");
  return JSON.parse(data);
}

describe("CF3 and Extensions emulator", () => {
  let test: TriggerEndToEndTest;

  before(async function (this) {
    this.timeout(TEST_SETUP_TIMEOUT);
    setUpExtensionsCache();

    expect(FIREBASE_PROJECT).to.exist.and.not.be.empty;

    const config = readConfig();
    const port = config.emulators!.storage.port;
    process.env.STORAGE_EMULATOR_HOST = `http://localhost:${port}`;

    test = new TriggerEndToEndTest(FIREBASE_PROJECT, __dirname, config);
    await test.startEmulators();

    admin.initializeApp({
      projectId: FIREBASE_PROJECT,
      credential: admin.credential.applicationDefault(),
      storageBucket: `${FIREBASE_PROJECT}.appspot.com`,
    });
  });

  after(async function (this) {
    this.timeout(EMULATORS_SHUTDOWN_DELAY_MS);
    cleanUpExtensionsCache();
    await test.stopEmulators();
  });

  it("should call a CF3 HTTPS function to write to the default Storage bucket, then trigger the resize images extension", async function (this) {
    this.timeout(EMULATOR_TEST_TIMEOUT);

    const response = await test.writeToDefaultStorage();
    expect(response.status).to.equal(200);

    /*
     * We delay here so that the functions have time to write and trigger -
     * this is happening in real time in a different process, so we have to wait like this.
     */
    await new Promise((resolve) => setTimeout(resolve, EMULATORS_WRITE_DELAY_MS));

    const fileResized = await admin.storage().bucket().file(STORAGE_RESIZED_FILE_NAME).exists();

    expect(fileResized[0]).to.be.true;
  });
});
