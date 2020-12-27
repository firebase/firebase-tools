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

  before(async function(this) {
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

  after(async function(this) {
    this.timeout(EMULATORS_SHUTDOWN_DELAY_MS);
    database?.goOffline();
    for (const fn of firestoreUnsub) fn();
    await firestore?.terminate();
    await test.stopEmulators();
  });

  it("should write to the database emulator", async function(this) {
    this.timeout(EMULATOR_TEST_TIMEOUT);

    const response = await test.writeToRtdb();
    expect(response.status).to.equal(200);
  });

  it("should write to the firestore emulator", async function(this) {
    this.timeout(EMULATOR_TEST_TIMEOUT);

    const response = await test.writeToFirestore();
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

  before(async function(this) {
    this.timeout(TEST_SETUP_TIMEOUT);

    expect(FIREBASE_PROJECT).to.exist.and.not.be.empty;

    const config = readConfig();
    test = new TriggerEndToEndTest(FIREBASE_PROJECT, __dirname, config);
    await test.startEmulators(["--only", "functions,pubsub"]);
  });

  after(async function(this) {
    this.timeout(EMULATORS_SHUTDOWN_DELAY_MS);
    await test.stopEmulators();
  });

  it("should write to the pubsub emulator", async function(this) {
    this.timeout(EMULATOR_TEST_TIMEOUT);

    const response = await test.writeToPubsub();
    expect(response.status).to.equal(200);
    await new Promise((resolve) => setTimeout(resolve, EMULATORS_WRITE_DELAY_MS));
  });

  it("should have have triggered cloud functions", () => {
    expect(test.pubsubTriggerCount).to.equal(1);
  });

  it("should write to the scheduled pubsub emulator", async function(this) {
    this.timeout(EMULATOR_TEST_TIMEOUT);

    const response = await test.writeToScheduledPubsub();
    expect(response.status).to.equal(200);
    await new Promise((resolve) => setTimeout(resolve, EMULATORS_WRITE_DELAY_MS));
  });

  it("should have have triggered cloud functions", () => {
    expect(test.pubsubTriggerCount).to.equal(2);
  });
});

describe("auth emulator function triggers", () => {
  let test: TriggerEndToEndTest;

  before(async function(this) {
    this.timeout(TEST_SETUP_TIMEOUT);

    expect(FIREBASE_PROJECT).to.exist.and.not.be.empty;

    const config = readConfig();
    test = new TriggerEndToEndTest(FIREBASE_PROJECT, __dirname, config);
    await test.startEmulators(["--only", "functions,auth"]);
  });

  after(async function(this) {
    this.timeout(EMULATORS_SHUTDOWN_DELAY_MS);
    await test.stopEmulators();
  });

  it("should write to the auth emulator", async function(this) {
    this.timeout(EMULATOR_TEST_TIMEOUT);
    const response = await test.writeToAuth();
    expect(response.status).to.equal(200);
    await new Promise((resolve) => setTimeout(resolve, EMULATORS_WRITE_DELAY_MS));
  });

  it("should have have triggered cloud functions", () => {
    expect(test.authTriggerCount).to.equal(1);
  });
});

describe("import/export end to end", () => {
  it("should be able to import/export firestore data", async function(this) {
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

  it("should be able to import/export rtdb data", async function(this) {
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
      ["--only", "database", "--import", exportPath, "--export-on-exit"],
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

    // Delete all of the import files
    for (const f of fs.readdirSync(dbExportPath)) {
      const fullPath = path.join(dbExportPath, f);
      fs.unlinkSync(fullPath);
    }

    // Delete all the data in one namespace
    await bApp
      .database()
      .ref()
      .set(null);

    // Stop the CLI (which will export on exit)
    await importCLI.stop();

    // Confirm the data exported is as expected
    const aPath = path.join(dbExportPath, "namespace-a.json");
    const aData = JSON.parse(fs.readFileSync(aPath).toString());
    expect(aData).to.deep.equal({ ns: "namespace-a" });

    const bPath = path.join(dbExportPath, "namespace-b.json");
    const bData = JSON.parse(fs.readFileSync(bPath).toString());
    expect(bData).to.equal(null);
  });

  it("should be able to import/export auth data", async function(this) {
    this.timeout(2 * TEST_SETUP_TIMEOUT);
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Start up emulator suite
    const project = FIREBASE_PROJECT || "example";
    const emulatorsCLI = new CLIProcess("1", __dirname);

    await emulatorsCLI.start("emulators:start", project, ["--only", "auth"], (data: unknown) => {
      if (typeof data != "string" && !Buffer.isBuffer(data)) {
        throw new Error(`data is not a string or buffer (${typeof data})`);
      }
      return data.includes(ALL_EMULATORS_STARTED_LOG);
    });

    // Create some accounts to export:
    const config = readConfig();
    const port = config.emulators!.auth.port;
    try {
      process.env.FIREBASE_AUTH_EMULATOR_HOST = `localhost:${port}`;
      const adminApp = admin.initializeApp(
        {
          projectId: project,
          credential: ADMIN_CREDENTIAL,
        },
        "admin-app"
      );
      await adminApp
        .auth()
        .createUser({ uid: "123", email: "foo@example.com", password: "testing" });
      await adminApp
        .auth()
        .createUser({ uid: "456", email: "bar@example.com", emailVerified: true });

      // Ask for export
      const exportCLI = new CLIProcess("2", __dirname);
      const exportPath = fs.mkdtempSync(path.join(os.tmpdir(), "emulator-data"));
      await exportCLI.start("emulators:export", project, [exportPath], (data: unknown) => {
        if (typeof data != "string" && !Buffer.isBuffer(data)) {
          throw new Error(`data is not a string or buffer (${typeof data})`);
        }
        return data.includes("Export complete");
      });
      await exportCLI.stop();

      // Stop the suite
      await emulatorsCLI.stop();

      // Confirm the data is exported as expected
      const configPath = path.join(exportPath, "auth_export", "config.json");
      const configData = JSON.parse(fs.readFileSync(configPath).toString());
      expect(configData).to.deep.equal({
        signIn: {
          allowDuplicateEmails: false,
        },
      });

      const accountsPath = path.join(exportPath, "auth_export", "accounts.json");
      const accountsData = JSON.parse(fs.readFileSync(accountsPath).toString());
      expect(accountsData.users).to.have.length(2);
      expect(accountsData.users[0]).to.deep.contain({
        localId: "123",
        email: "foo@example.com",
        emailVerified: false,
        providerUserInfo: [
          {
            email: "foo@example.com",
            federatedId: "foo@example.com",
            providerId: "password",
            rawId: "foo@example.com",
          },
        ],
      });
      expect(accountsData.users[0].passwordHash).to.match(/:password=testing$/);
      expect(accountsData.users[1]).to.deep.contain({
        localId: "456",
        email: "bar@example.com",
        emailVerified: true,
      });

      // Attempt to import
      const importCLI = new CLIProcess("3", __dirname);
      await importCLI.start(
        "emulators:start",
        project,
        ["--only", "auth", "--import", exportPath],
        (data: unknown) => {
          if (typeof data != "string" && !Buffer.isBuffer(data)) {
            throw new Error(`data is not a string or buffer (${typeof data})`);
          }
          return data.includes(ALL_EMULATORS_STARTED_LOG);
        }
      );

      // Check users are indeed imported correctly
      const user1 = await adminApp.auth().getUserByEmail("foo@example.com");
      expect(user1.passwordHash).to.match(/:password=testing$/);
      const user2 = await adminApp.auth().getUser("456");
      expect(user2.emailVerified).to.be.true;

      await importCLI.stop();
    } finally {
      delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
    }
  });

  it("should be able to export / import auth data with no users", async function(this) {
    this.timeout(2 * TEST_SETUP_TIMEOUT);
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Start up emulator suite
    const project = FIREBASE_PROJECT || "example";
    const emulatorsCLI = new CLIProcess("1", __dirname);

    await emulatorsCLI.start("emulators:start", project, ["--only", "auth"], (data: unknown) => {
      if (typeof data != "string" && !Buffer.isBuffer(data)) {
        throw new Error(`data is not a string or buffer (${typeof data})`);
      }
      return data.includes(ALL_EMULATORS_STARTED_LOG);
    });

    // Ask for export (with no users)
    const exportCLI = new CLIProcess("2", __dirname);
    const exportPath = fs.mkdtempSync(path.join(os.tmpdir(), "emulator-data"));
    await exportCLI.start("emulators:export", project, [exportPath], (data: unknown) => {
      if (typeof data != "string" && !Buffer.isBuffer(data)) {
        throw new Error(`data is not a string or buffer (${typeof data})`);
      }
      return data.includes("Export complete");
    });
    await exportCLI.stop();

    // Stop the suite
    await emulatorsCLI.stop();

    // Confirm the data is exported as expected
    const configPath = path.join(exportPath, "auth_export", "config.json");
    const configData = JSON.parse(fs.readFileSync(configPath).toString());
    expect(configData).to.deep.equal({
      signIn: {
        allowDuplicateEmails: false,
      },
    });

    const accountsPath = path.join(exportPath, "auth_export", "accounts.json");
    const accountsData = JSON.parse(fs.readFileSync(accountsPath).toString());
    expect(accountsData.users).to.have.length(0);

    // Attempt to import
    const importCLI = new CLIProcess("3", __dirname);
    await importCLI.start(
      "emulators:start",
      project,
      ["--only", "auth", "--import", exportPath],
      (data: unknown) => {
        if (typeof data != "string" && !Buffer.isBuffer(data)) {
          throw new Error(`data is not a string or buffer (${typeof data})`);
        }
        return data.includes(ALL_EMULATORS_STARTED_LOG);
      }
    );

    await importCLI.stop();
  });
});
