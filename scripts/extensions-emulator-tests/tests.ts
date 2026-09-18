import { expect } from "chai";
import * as admin from "firebase-admin";
import * as fs from "fs";
import { rmSync } from "node:fs";
import * as path from "path";

import { FrameworkOptions, TriggerEndToEndTest } from "../integration-helpers/framework";

const FIREBASE_PROJECT = process.env.FBTOOLS_TARGET_PROJECT || "";

/*
 * Various delays that are needed because this test spawns
 * parallel emulator subprocesses.
 */
const TEST_SETUP_TIMEOUT = 120000;
const EMULATORS_SHUTDOWN_DELAY_MS = 25000;
const EMULATOR_TEST_TIMEOUT = 30000;
const EXTENSION_POLL_INTERVAL_MS = 100;
const EXTENSION_POLL_TIMEOUT_MS = 15000;
const STORAGE_FILE_NAME = "test.png";
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
    rmSync(process.env.FIREBASE_EXTENSIONS_CACHE_PATH, { recursive: true });
  }
}

async function pollForExtensionOutput(): Promise<{
  fileResized: boolean;
  eventFired: FirebaseFirestore.DocumentSnapshot;
}> {
  const start = Date.now();
  while (Date.now() - start < EXTENSION_POLL_TIMEOUT_MS) {
    try {
      const [exists] = await admin.storage().bucket().file(STORAGE_RESIZED_FILE_NAME).exists();
      if (exists) {
        const doc = await admin
          .firestore()
          .collection("resizedImages")
          .doc(STORAGE_FILE_NAME)
          .get();
        if (doc.exists && doc.data()?.eventHandlerFired) {
          return { fileResized: true, eventFired: doc };
        }
      }
    } catch {
      // Retrying until timeout or success
    }
    await new Promise((resolve) => setTimeout(resolve, EXTENSION_POLL_INTERVAL_MS));
  }
  throw new Error(
    `Timed out after ${EXTENSION_POLL_TIMEOUT_MS}ms waiting for resized file and firestore document`,
  );
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
    const storagePort = config.emulators!.storage.port;
    process.env.STORAGE_EMULATOR_HOST = `http://127.0.0.1:${storagePort}`;

    const firestorePort = config.emulators!.firestore.port;
    process.env.FIRESTORE_EMULATOR_HOST = `localhost:${firestorePort}`;

    test = new TriggerEndToEndTest(FIREBASE_PROJECT, __dirname, config);
    await test.startEmulators(["--only", "functions,extensions,storage,eventarc,firestore"]);

    admin.initializeApp({
      projectId: FIREBASE_PROJECT,
      credential: admin.credential.applicationDefault(),
      storageBucket: `${FIREBASE_PROJECT}.appspot.com`,
    });
  });

  after(async function (this) {
    this.timeout(EMULATORS_SHUTDOWN_DELAY_MS);
    await Promise.all(admin.apps.map((app) => app?.delete()));
    cleanUpExtensionsCache();
    await test.stopEmulators();
  });

  it("should call a CF3 HTTPS function to write to the default Storage bucket, then trigger the resize images extension", async function (this) {
    this.timeout(EMULATOR_TEST_TIMEOUT);

    const response = await test.writeToDefaultStorage();
    expect(response.status).to.equal(200);

    const { fileResized, eventFired } = await pollForExtensionOutput();
    expect(fileResized).to.be.true;
    expect(eventFired.exists).to.be.true;
    expect(eventFired.data()?.eventHandlerFired).to.be.true;
  });
});
