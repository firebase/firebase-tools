import { expect } from "chai";
import * as admin from "firebase-admin";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { CLIProcess } from "../integration-helpers/cli";
import { FrameworkOptions } from "../integration-helpers/framework";
import { Resolver } from "../../src/emulator/dns";

const FIREBASE_PROJECT = process.env.FBTOOLS_TARGET_PROJECT || "";
const ADMIN_CREDENTIAL = {
  getAccessToken: () => {
    return Promise.resolve({
      expires_in: 1000000,
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

const r = new Resolver();
let addr: string;
async function localhost(): Promise<string> {
  if (addr) {
    return addr;
  }
  const a = await r.lookupFirst("localhost");
  addr = a.address;
  return addr;
}

function readConfig(): FrameworkOptions {
  const filename = path.join(__dirname, "firebase.json");
  const data = fs.readFileSync(filename, "utf8");
  return JSON.parse(data);
}

function logIncludes(msg: string) {
  return (data: unknown) => {
    if (typeof data !== "string" && !Buffer.isBuffer(data)) {
      throw new Error(`data is not a string or buffer (${typeof data})`);
    }
    return data.includes(msg);
  };
}

describe("import/export end to end", () => {
  it("should be able to import/export firestore data", async function (this) {
    this.timeout(2 * TEST_SETUP_TIMEOUT);
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Start up emulator suite
    const emulatorsCLI = new CLIProcess("1", __dirname);
    await emulatorsCLI.start(
      "emulators:start",
      FIREBASE_PROJECT,
      ["--only", "firestore", "--debug"],
      (data: unknown) => {
        if (typeof data !== "string" && !Buffer.isBuffer(data)) {
          throw new Error(`data is not a string or buffer (${typeof data})`);
        }
        return data.includes(ALL_EMULATORS_STARTED_LOG);
      },
    );

    // Ask for export
    const exportCLI = new CLIProcess("2", __dirname);
    const exportPath = fs.mkdtempSync(path.join(os.tmpdir(), "emulator-data"));
    await exportCLI.start("emulators:export", FIREBASE_PROJECT, [exportPath], (data: unknown) => {
      if (typeof data !== "string" && !Buffer.isBuffer(data)) {
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
      ["--only", "firestore", "--import", exportPath, "--debug"],
      (data: unknown) => {
        if (typeof data !== "string" && !Buffer.isBuffer(data)) {
          throw new Error(`data is not a string or buffer (${typeof data})`);
        }
        return data.includes(ALL_EMULATORS_STARTED_LOG);
      },
    );

    await importCLI.stop();

    expect(true).to.be.true;
  });

  it("should be able to import/export rtdb data", async function (this) {
    this.timeout(2 * TEST_SETUP_TIMEOUT);
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Start up emulator suite
    const emulatorsCLI = new CLIProcess("1", __dirname);
    await emulatorsCLI.start(
      "emulators:start",
      FIREBASE_PROJECT,
      ["--only", "database", "--debug"],
      (data: unknown) => {
        if (typeof data !== "string" && !Buffer.isBuffer(data)) {
          throw new Error(`data is not a string or buffer (${typeof data})`);
        }
        return data.includes(ALL_EMULATORS_STARTED_LOG);
      },
    );

    // Write some data to export
    const config = readConfig();
    const port = config.emulators!.database.port;
    const host = await localhost();
    const aApp = admin.initializeApp(
      {
        projectId: FIREBASE_PROJECT,
        databaseURL: `http://${host}:${port}?ns=namespace-a`,
        credential: ADMIN_CREDENTIAL,
      },
      "rtdb-export-a",
    );
    const bApp = admin.initializeApp(
      {
        projectId: FIREBASE_PROJECT,
        databaseURL: `http://${host}:${port}?ns=namespace-b`,
        credential: ADMIN_CREDENTIAL,
      },
      "rtdb-export-b",
    );
    const cApp = admin.initializeApp(
      {
        projectId: FIREBASE_PROJECT,
        databaseURL: `http://${host}:${port}?ns=namespace-c`,
        credential: ADMIN_CREDENTIAL,
      },
      "rtdb-export-c",
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
      if (typeof data !== "string" && !Buffer.isBuffer(data)) {
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
      ["--only", "database", "--import", exportPath, "--export-on-exit", "--debug"],
      (data: unknown) => {
        if (typeof data !== "string" && !Buffer.isBuffer(data)) {
          throw new Error(`data is not a string or buffer (${typeof data})`);
        }
        return data.includes(ALL_EMULATORS_STARTED_LOG);
      },
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
    await bApp.database().ref().set(null);

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

  it("should be able to import/export auth data", async function (this) {
    this.timeout(2 * TEST_SETUP_TIMEOUT);
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Start up emulator suite
    const project = FIREBASE_PROJECT || "example";
    const emulatorsCLI = new CLIProcess("1", __dirname);

    await emulatorsCLI.start(
      "emulators:start",
      project,
      ["--only", "auth", "--debug"],
      (data: unknown) => {
        if (typeof data !== "string" && !Buffer.isBuffer(data)) {
          throw new Error(`data is not a string or buffer (${typeof data})`);
        }
        return data.includes(ALL_EMULATORS_STARTED_LOG);
      },
    );

    // Create some accounts to export:
    const config = readConfig();
    const port = config.emulators!.auth.port;
    try {
      process.env.FIREBASE_AUTH_EMULATOR_HOST = `${await localhost()}:${port}`;
      const adminApp = admin.initializeApp(
        {
          projectId: project,
          credential: ADMIN_CREDENTIAL,
        },
        "admin-app",
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
        if (typeof data !== "string" && !Buffer.isBuffer(data)) {
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
        emailPrivacyConfig: {
          enableImprovedEmailPrivacy: false,
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
        ["--only", "auth", "--import", exportPath, "--debug"],
        (data: unknown) => {
          if (typeof data !== "string" && !Buffer.isBuffer(data)) {
            throw new Error(`data is not a string or buffer (${typeof data})`);
          }
          return data.includes(ALL_EMULATORS_STARTED_LOG);
        },
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

  it("should be able to import/export auth data with many users", async function (this) {
    this.timeout(2 * TEST_SETUP_TIMEOUT);
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Start up emulator suite
    const project = FIREBASE_PROJECT || "example";
    const emulatorsCLI = new CLIProcess("1", __dirname);

    await emulatorsCLI.start(
      "emulators:start",
      project,
      ["--only", "auth", "--debug"],
      (data: unknown) => {
        if (typeof data !== "string" && !Buffer.isBuffer(data)) {
          throw new Error(`data is not a string or buffer (${typeof data})`);
        }
        return data.includes(ALL_EMULATORS_STARTED_LOG);
      },
    );

    // Create some accounts to export:
    const accountCount = 777; // ~120KB data when exported
    const config = readConfig();
    const port = config.emulators!.auth.port;
    try {
      process.env.FIREBASE_AUTH_EMULATOR_HOST = `${await localhost()}:${port}`;
      const adminApp = admin.initializeApp(
        {
          projectId: project,
          credential: ADMIN_CREDENTIAL,
        },
        "admin-app2",
      );
      for (let i = 0; i < accountCount; i++) {
        await adminApp
          .auth()
          .createUser({ uid: `u${i}`, email: `u${i}@example.com`, password: "testing" });
      }
      // Ask for export
      const exportCLI = new CLIProcess("2", __dirname);
      const exportPath = fs.mkdtempSync(path.join(os.tmpdir(), "emulator-data"));
      await exportCLI.start("emulators:export", project, [exportPath], (data: unknown) => {
        if (typeof data !== "string" && !Buffer.isBuffer(data)) {
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
        emailPrivacyConfig: {
          enableImprovedEmailPrivacy: false,
        },
      });

      const accountsPath = path.join(exportPath, "auth_export", "accounts.json");
      const accountsData = JSON.parse(fs.readFileSync(accountsPath).toString());
      expect(accountsData.users).to.have.length(accountCount);

      // Attempt to import
      const importCLI = new CLIProcess("3", __dirname);
      await importCLI.start(
        "emulators:start",
        project,
        ["--only", "auth", "--import", exportPath, "--debug"],
        (data: unknown) => {
          if (typeof data !== "string" && !Buffer.isBuffer(data)) {
            throw new Error(`data is not a string or buffer (${typeof data})`);
          }
          return data.includes(ALL_EMULATORS_STARTED_LOG);
        },
      );

      // Check users are indeed imported correctly
      const user = await adminApp.auth().getUserByEmail(`u${accountCount - 1}@example.com`);
      expect(user.passwordHash).to.match(/:password=testing$/);

      await importCLI.stop();
    } finally {
      delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
    }
  });
  it("should be able to export / import auth data with no users", async function (this) {
    this.timeout(2 * TEST_SETUP_TIMEOUT);
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Start up emulator suite
    const project = FIREBASE_PROJECT || "example";
    const emulatorsCLI = new CLIProcess("1", __dirname);

    await emulatorsCLI.start(
      "emulators:start",
      project,
      ["--only", "auth", "--debug"],
      (data: unknown) => {
        if (typeof data !== "string" && !Buffer.isBuffer(data)) {
          throw new Error(`data is not a string or buffer (${typeof data})`);
        }
        return data.includes(ALL_EMULATORS_STARTED_LOG);
      },
    );

    // Ask for export (with no users)
    const exportCLI = new CLIProcess("2", __dirname);
    const exportPath = fs.mkdtempSync(path.join(os.tmpdir(), "emulator-data"));
    await exportCLI.start("emulators:export", project, [exportPath], (data: unknown) => {
      if (typeof data !== "string" && !Buffer.isBuffer(data)) {
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
      emailPrivacyConfig: {
        enableImprovedEmailPrivacy: false,
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
      ["--only", "auth", "--import", exportPath, "--debug"],
      (data: unknown) => {
        if (typeof data !== "string" && !Buffer.isBuffer(data)) {
          throw new Error(`data is not a string or buffer (${typeof data})`);
        }
        return data.includes(ALL_EMULATORS_STARTED_LOG);
      },
    );

    await importCLI.stop();
  });

  it("should be able to import/export storage data", async function (this) {
    this.timeout(2 * TEST_SETUP_TIMEOUT);
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Start up emulator suite
    const emulatorsCLI = new CLIProcess("1", __dirname);
    await emulatorsCLI.start(
      "emulators:start",
      FIREBASE_PROJECT,
      ["--only", "storage", "--debug"],
      logIncludes(ALL_EMULATORS_STARTED_LOG),
    );

    const credPath = path.join(__dirname, "service-account-key.json");
    const credential = fs.existsSync(credPath)
      ? admin.credential.cert(credPath)
      : admin.credential.applicationDefault();

    const config = readConfig();
    const port = config.emulators!.storage.port;
    process.env.STORAGE_EMULATOR_HOST = `http://${await localhost()}:${port}`;

    // Write some data to export
    const aApp = admin.initializeApp(
      {
        projectId: FIREBASE_PROJECT,
        storageBucket: "bucket-a",
        credential,
      },
      "storage-export-a",
    );
    const bApp = admin.initializeApp(
      {
        projectId: FIREBASE_PROJECT,
        storageBucket: "bucket-b",
        credential,
      },
      "storage-export-b",
    );

    // Write data to two buckets
    await aApp.storage().bucket().file("a/b.txt").save("a/b hello, world!");
    await aApp.storage().bucket().file("c/d.txt").save("c/d hello, world!");
    await bApp.storage().bucket().file("e/f.txt").save("e/f hello, world!");
    await bApp.storage().bucket().file("g/h.txt").save("g/h hello, world!");

    // Ask for export
    const exportCLI = new CLIProcess("2", __dirname);
    const exportPath = fs.mkdtempSync(path.join(os.tmpdir(), "emulator-data"));
    await exportCLI.start(
      "emulators:export",
      FIREBASE_PROJECT,
      [exportPath],
      logIncludes("Export complete"),
    );
    await exportCLI.stop();

    // Check that the right export files are created
    const storageExportPath = path.join(exportPath, "storage_export");
    const storageExportFiles = fs.readdirSync(storageExportPath).sort();
    expect(storageExportFiles).to.eql(["blobs", "buckets.json", "metadata"]);

    // Stop the suite
    await emulatorsCLI.stop();

    // Attempt to import
    const importCLI = new CLIProcess("3", __dirname);
    await importCLI.start(
      "emulators:start",
      FIREBASE_PROJECT,
      ["--only", "storage", "--import", exportPath, "--debug"],
      logIncludes(ALL_EMULATORS_STARTED_LOG),
    );

    // List the files
    const [aFiles] = await aApp.storage().bucket().getFiles({
      prefix: "a/",
    });
    const aFileNames = aFiles.map((f) => f.name).sort();
    expect(aFileNames).to.eql(["a/b.txt"]);

    const [bFiles] = await bApp.storage().bucket().getFiles({
      prefix: "e/",
    });
    const bFileNames = bFiles.map((f) => f.name).sort();
    expect(bFileNames).to.eql(["e/f.txt"]);

    // TODO: this operation fails due to a bug in the Storage emulator
    // https://github.com/firebase/firebase-tools/pull/3320
    //
    // Read a file and check content
    // const [f] = await aApp.storage().bucket().file("a/b.txt").get();
    // const [buf] = await f.download();
    // expect(buf.toString()).to.eql("a/b hello, world!");

    await importCLI.stop();
  });

  it("should automatically export to dataDir when specified in firebase.json", async function (this) {
    this.timeout(2 * TEST_SETUP_TIMEOUT);
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const dataDir = path.join(__dirname, "hello"); // This is taken from firebase.json dataDir

    const firestoreData = { testCollection: { testDoc: { foo: "bar", baz: "buzz" } } };

    // Start emulator - it should export data to dataDir on exit
    let emulatorsCLI = new CLIProcess("dataDir-export", __dirname);
    await emulatorsCLI.start(
      "emulators:start",
      "datadir-export-project",
      ["--only", "firestore", "--debug"],
      logIncludes(ALL_EMULATORS_STARTED_LOG),
    );

    // Add data to Firestore
    const configForAdmin = readConfig(); // Assuming readConfig() gets Firestore port
    const port = configForAdmin.emulators!.firestore.port;
    const host = await localhost(); // Make sure localhost is resolved
    process.env.FIRESTORE_EMULATOR_HOST = `${host}:${port}`;
    const adminApp = admin.initializeApp(
      {
        projectId: "datadir-export-project",
      },
      "firestore-dataDir-test-export",
    );

    const db = adminApp.firestore();
    const docRefId = (
      await db.collection("testCollection").add(firestoreData.testCollection.testDoc)
    ).id;

    await adminApp.delete();
    // Stop the emulator suite - this should trigger export to dataDir
    await emulatorsCLI.stop();

    // Verify data was exported to dataDir
    // Firestore data is stored in a subdirectory named after the project ID, then 'fs_export_output'
    // and then a metadata file and the actual data files.
    const firestoreExportMetadataPath = path.join(
      dataDir,
      "firestore_export",
      "firestore_export.overall_export_metadata",
    );
    expect(
      fs.existsSync(firestoreExportMetadataPath),
      `Firestore export metadata should exist at ${firestoreExportMetadataPath}`,
    ).to.be.true;

    // Start emulator again - it should automatically import from dataDir
    emulatorsCLI = new CLIProcess("dataDir-import", __dirname);
    await emulatorsCLI.start(
      "emulators:start",
      "datadir-export-project",
      // TODO(christhompsongoogle): Remove the import once imports from dataDir are implemented.
      // Also note to self: ensure the import flag supercedes the dataDir property.
      ["--only", "firestore", "--debug", "--import", dataDir],
      logIncludes(ALL_EMULATORS_STARTED_LOG),
    );

    // Verify data was imported
    const adminAppImport = admin.initializeApp(
      {
        projectId: "datadir-export-project",
      },
      "firestore-dataDir-test-import",
    );

    const dbImport = adminAppImport.firestore();
    const docSnap = await dbImport.collection("testCollection").doc(docRefId).get();
    expect(docSnap.exists, "Document should exist after import from dataDir").to.be.true;
    expect(docSnap.data(), "Document data should match after import from dataDir").to.deep.equal(
      firestoreData.testCollection.testDoc,
    );
    await adminAppImport.delete();

    // Stop the emulator suite
    await emulatorsCLI.stop();

    // Clean up temporary directory
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
});
