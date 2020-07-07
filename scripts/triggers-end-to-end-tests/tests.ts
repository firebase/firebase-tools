import { expect } from "chai";
import * as admin from "firebase-admin";
import { Firestore } from "@google-cloud/firestore";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { CLIProcess } from "../integration-helpers/cli";
import { FrameworkOptions, TriggerEndToEndTest } from "../integration-helpers/framework";

const FIREBASE_PROJECT = process.env.FBTOOLS_TARGET_PROJECT || "";
const ADMIN_CREDENTIAL = {
  getAccessToken: () => {
    return Promise.resolve({
      // eslint-disable-next-line @typescript-eslint/camelcase
      expires_in: 1000000,
      // eslint-disable-next-line @typescript-eslint/camelcase
      access_token: "owner",
    });
  },
};

const ALL_EMULATORS_STARTED_LOG = "All emulators ready";

/*
 * Various delays that are needed because this test spawns
 * parallel emulator subprocesses.
 */
const TEST_SETUP_TIMEOUT = 60000;
const EMULATORS_WRITE_DELAY_MS = 5000;
const EMULATORS_SHUTDOWN_DELAY_MS = 5000;
const EMULATOR_TEST_TIMEOUT = EMULATORS_WRITE_DELAY_MS * 2;

/*
 * Realtime Database and Firestore documents we used to verify
 * bidirectional communication between the two via cloud functions.
 */
const FIRESTORE_COMPLETION_MARKER = "test/done_from_firestore";
const DATABASE_COMPLETION_MARKER = "test/done_from_database";

function readConfig(): FrameworkOptions {
  const filename = path.join(__dirname, "firebase.json");
  const data = fs.readFileSync(filename, "utf8");
  return JSON.parse(data);
}

describe("database and firestore emulator function triggers", () => {
  let test: TriggerEndToEndTest;
  let database: admin.database.Database | undefined;
  let firestore: admin.firestore.Firestore | undefined;
  const firestoreUnsub: Array<() => void> = [];

  before(async function() {
    // eslint-disable-next-line no-invalid-this
    this.timeout(TEST_SETUP_TIMEOUT);

    expect(FIREBASE_PROJECT).to.exist.and.not.be.empty;

    const config = readConfig();
    test = new TriggerEndToEndTest(FIREBASE_PROJECT, __dirname, config);
    await test.startEmulators(["--only", "functions,database,firestore"]);

    firestore = new Firestore({
      port: test.firestoreEmulatorPort,
      projectId: FIREBASE_PROJECT,
      servicePath: "localhost",
      ssl: false,
    });

    admin.initializeApp({
      projectId: FIREBASE_PROJECT,
      databaseURL: `http://localhost:${test.rtdbEmulatorPort}?ns=${FIREBASE_PROJECT}`,
      credential: ADMIN_CREDENTIAL,
    });

    database = admin.database();

    // /*
    //  * Install completion marker handlers and have them update state
    //  * in the global test fixture on success. We will later check that
    //  * state to determine whether the test passed or failed.
    //  */
    database.ref(FIRESTORE_COMPLETION_MARKER).on(
      "value",
      (/* snap */) => {
        test.rtdbFromFirestore = true;
      },
      (err: Error) => {
        expect.fail(err, `Error reading ${FIRESTORE_COMPLETION_MARKER} from database emulator.`);
      }
    );

    database.ref(DATABASE_COMPLETION_MARKER).on(
      "value",
      (/* snap */) => {
        test.rtdbFromRtdb = true;
      },
      (err: Error) => {
        expect.fail(err, `Error reading ${DATABASE_COMPLETION_MARKER} from database emulator.`);
      }
    );

    let unsub = firestore.doc(FIRESTORE_COMPLETION_MARKER).onSnapshot(
      (/* snap */) => {
        test.firestoreFromFirestore = true;
      },
      (err: Error) => {
        expect.fail(err, `Error reading ${FIRESTORE_COMPLETION_MARKER} from firestore emulator.`);
      }
    );
    firestoreUnsub.push(unsub);

    unsub = firestore.doc(DATABASE_COMPLETION_MARKER).onSnapshot(
      (/* snap */) => {
        test.firestoreFromRtdb = true;
      },
      (err: Error) => {
        expect.fail(err, `Error reading ${DATABASE_COMPLETION_MARKER} from firestore emulator.`);
      }
    );
    firestoreUnsub.push(unsub);
  });

  after(async function() {
    // eslint-disable-next-line no-invalid-this
    this.timeout(EMULATORS_SHUTDOWN_DELAY_MS);
    database?.goOffline();
    for (const fn of firestoreUnsub) fn();
    await firestore?.terminate();
    await test.stopEmulators();
  });

  it("should write to the database emulator", async function() {
    // eslint-disable-next-line no-invalid-this
    this.timeout(EMULATOR_TEST_TIMEOUT);

    const response = await test.writeToRtdb();
    expect(response.statusCode).to.equal(200);
  });

  it("should write to the firestore emulator", async function() {
    // eslint-disable-next-line no-invalid-this
    this.timeout(EMULATOR_TEST_TIMEOUT);

    const response = await test.writeToFirestore();
    expect(response.statusCode).to.equal(200);

    /*
     * We delay again here because the functions triggered
     * by the previous two writes run parallel to this and
     * we need to give them and previous installed test
     * fixture state handlers to complete before we check
     * that state in the next test.
     */
    await new Promise((resolve) => setTimeout(resolve, EMULATORS_WRITE_DELAY_MS));
  });

  it("should have have triggered cloud functions", () => {
    expect(test.rtdbTriggerCount).to.equal(1);
    expect(test.firestoreTriggerCount).to.equal(1);
    /*
     * Check for the presence of all expected documents in the firestore
     * and database emulators.
     */
    expect(test.success()).to.equal(true);
  });
});

describe("pubsub emulator function triggers", () => {
  let test: TriggerEndToEndTest;

  before(async function() {
    // eslint-disable-next-line no-invalid-this
    this.timeout(TEST_SETUP_TIMEOUT);

    expect(FIREBASE_PROJECT).to.exist.and.not.be.empty;

    const config = readConfig();
    test = new TriggerEndToEndTest(FIREBASE_PROJECT, __dirname, config);
    await test.startEmulators(["--only", "functions,pubsub"]);
  });

  after(async function() {
    // eslint-disable-next-line no-invalid-this
    this.timeout(EMULATORS_SHUTDOWN_DELAY_MS);
    await test.stopEmulators();
  });

  it("should write to the pubsub emulator", async function() {
    // eslint-disable-next-line no-invalid-this
    this.timeout(EMULATOR_TEST_TIMEOUT);

    const response = await test.writeToPubsub();
    expect(response.statusCode).to.equal(200);
    await new Promise((resolve) => setTimeout(resolve, EMULATORS_WRITE_DELAY_MS));
  });

  it("should have have triggered cloud functions", () => {
    expect(test.pubsubTriggerCount).to.equal(1);
  });

  it("should write to the scheduled pubsub emulator", async function() {
    // eslint-disable-next-line no-invalid-this
    this.timeout(EMULATOR_TEST_TIMEOUT);

    const response = await test.writeToScheduledPubsub();
    expect(response.statusCode).to.equal(200);
    await new Promise((resolve) => setTimeout(resolve, EMULATORS_WRITE_DELAY_MS));
  });

  it("should have have triggered cloud functions", () => {
    expect(test.pubsubTriggerCount).to.equal(2);
  });
});

describe("import/export end to end", () => {
  it("should be able to import/export firestore data", async function() {
    // eslint-disable-next-line no-invalid-this
    this.timeout(2 * TEST_SETUP_TIMEOUT);
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Start up emulator suite
    const emulatorsCLI = new CLIProcess("1", __dirname);
    await emulatorsCLI.start(
      "emulators:start",
      FIREBASE_PROJECT,
      ["--only", "firestore"],
      (data: unknown) => {
        if (typeof data != "string" && !Buffer.isBuffer(data)) {
          throw new Error(`data is not a string or buffer (${typeof data})`);
        }
        return data.includes(ALL_EMULATORS_STARTED_LOG);
      }
    );

    // Ask for export
    const exportCLI = new CLIProcess("2", __dirname);
    const exportPath = fs.mkdtempSync(path.join(os.tmpdir(), "emulator-data"));
    await exportCLI.start("emulators:export", FIREBASE_PROJECT, [exportPath], (data: unknown) => {
      if (typeof data != "string" && !Buffer.isBuffer(data)) {
        throw new Error(`data is not a string or buffer (${typeof data})`);
      }
      return data.includes("Export complete");
    });
    await exportCLI.stop();

    // Stop the suite
    await emulatorsCLI.stop();

    // Attempt to import
    const importCLI = new CLIProcess("3", __dirname);
    await importCLI.start(
      "emulators:start",
      FIREBASE_PROJECT,
      ["--only", "firestore", "--import", exportPath],
      (data: unknown) => {
        if (typeof data != "string" && !Buffer.isBuffer(data)) {
          throw new Error(`data is not a string or buffer (${typeof data})`);
        }
        return data.includes(ALL_EMULATORS_STARTED_LOG);
      }
    );

    await importCLI.stop();

    expect(true).to.be.true;
  });

  it("should be able to import/export rtdb data", async function() {
    // eslint-disable-next-line no-invalid-this
    this.timeout(2 * TEST_SETUP_TIMEOUT);
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Start up emulator suite
    const emulatorsCLI = new CLIProcess("1", __dirname);
    await emulatorsCLI.start(
      "emulators:start",
      FIREBASE_PROJECT,
      ["--only", "database"],
      (data: unknown) => {
        if (typeof data != "string" && !Buffer.isBuffer(data)) {
          throw new Error(`data is not a string or buffer (${typeof data})`);
        }
        return data.includes(ALL_EMULATORS_STARTED_LOG);
      }
    );

    // Write some data to export
    const config = readConfig();
    const port = config.emulators!.database.port;
    const aApp = admin.initializeApp(
      {
        projectId: FIREBASE_PROJECT,
        databaseURL: `http://localhost:${port}?ns=namespace-a`,
        credential: ADMIN_CREDENTIAL,
      },
      "rtdb-export-a"
    );
    const bApp = admin.initializeApp(
      {
        projectId: FIREBASE_PROJECT,
        databaseURL: `http://localhost:${port}?ns=namespace-b`,
        credential: ADMIN_CREDENTIAL,
      },
      "rtdb-export-b"
    );
    const cApp = admin.initializeApp(
      {
        projectId: FIREBASE_PROJECT,
        databaseURL: `http://localhost:${port}?ns=namespace-c`,
        credential: ADMIN_CREDENTIAL,
      },
      "rtdb-export-c"
    );

    // Write to two namespaces
    const aRef = aApp.database().ref("ns");
    await aRef.set("namespace-a");
    const bRef = bApp.database().ref("ns");
    await bRef.set("namespace-b");

    // Read from a third
    const cRef = cApp.database().ref("ns");
    await cRef.once("value");

    // Ask for export
    const exportCLI = new CLIProcess("2", __dirname);
    const exportPath = fs.mkdtempSync(path.join(os.tmpdir(), "emulator-data"));
    await exportCLI.start("emulators:export", FIREBASE_PROJECT, [exportPath], (data: unknown) => {
      if (typeof data != "string" && !Buffer.isBuffer(data)) {
        throw new Error(`data is not a string or buffer (${typeof data})`);
      }
      return data.includes("Export complete");
    });
    await exportCLI.stop();

    // Check that the right export files are created
    const dbExportPath = path.join(exportPath, "database_export");
    const dbExportFiles = fs.readdirSync(dbExportPath);
    expect(dbExportFiles).to.eql(["namespace-a.json", "namespace-b.json"]);

    // Stop the suite
    await emulatorsCLI.stop();

    // Attempt to import
    const importCLI = new CLIProcess("3", __dirname);
    await importCLI.start(
      "emulators:start",
      FIREBASE_PROJECT,
      ["--only", "database", "--import", exportPath],
      (data: unknown) => {
        if (typeof data != "string" && !Buffer.isBuffer(data)) {
          throw new Error(`data is not a string or buffer (${typeof data})`);
        }
        return data.includes(ALL_EMULATORS_STARTED_LOG);
      }
    );

    // Read the data
    const aSnap = await aRef.once("value");
    const bSnap = await bRef.once("value");
    expect(aSnap.val()).to.eql("namespace-a");
    expect(bSnap.val()).to.eql("namespace-b");

    await importCLI.stop();
  });
});
