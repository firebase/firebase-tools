import { expect } from "chai";
import * as admin from "firebase-admin";
import * as fs from "fs";
import * as rimraf from "rimraf";
import * as path from "path";

import { CLIProcess } from "../integration-helpers/cli";
import { FrameworkOptions, TriggerEndToEndTest } from "../integration-helpers/framework";
import { file } from "tmp";

const FIREBASE_PROJECT = process.env.FBTOOLS_TARGET_PROJECT || "";

const ALL_EMULATORS_STARTED_LOG = "All emulators ready";

/*
 * Various delays that are needed because this test spawns
 * parallel emulator subprocesses.
 */
const TEST_SETUP_TIMEOUT = 60000;
const EMULATORS_WRITE_DELAY_MS = 5000;
const EMULATORS_SHUTDOWN_DELAY_MS = 5000;
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

function logIncludes(msg: string) {
  return (data: unknown) => {
    if (typeof data != "string" && !Buffer.isBuffer(data)) {
      throw new Error(`data is not a string or buffer (${typeof data})`);
    }
    return data.includes(msg);
  };
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

  it("should call a CF3 HTTPS function to write to the default Storage bucket", async function (this) {
    this.timeout(EMULATOR_TEST_TIMEOUT);

    const response = await test.writeToDefaultStorage();
    expect(response.status).to.equal(200);

    /*
     * We delay again here because the functions triggered
     * by the previous two writes run parallel to this and
     * we need to give them and previous installed test
     * fixture state handlers to complete before we check
     * that state in the next test.
     */
    await new Promise((resolve) => setTimeout(resolve, EMULATORS_WRITE_DELAY_MS));
  });

  it("should have have triggered an Extension Firestore function", async () => {
    const fileResized = await admin.storage().bucket().file(STORAGE_RESIZED_FILE_NAME).exists();

    expect(fileResized).to.be.true;
  });
});
