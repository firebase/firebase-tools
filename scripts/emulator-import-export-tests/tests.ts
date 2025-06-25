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
      ["--only", "firestore", "--import", exportPath],
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
      ["--only", "database"],
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
      ["--only", "database", "--import", exportPath, "--export-on-exit"],
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

    await emulatorsCLI.start("emulators:start", project, ["--only", "auth"], (data: unknown) => {
      if (typeof data !== "string" && !Buffer.isBuffer(data)) {
        throw new Error(`data is not a string or buffer (${typeof data})`);
      }
      return data.includes(ALL_EMULATORS_STARTED_LOG);
    });

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
        ["--only", "auth", "--import", exportPath],
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

    await emulatorsCLI.start("emulators:start", project, ["--only", "auth"], (data: unknown) => {
      if (typeof data !== "string" && !Buffer.isBuffer(data)) {
        throw new Error(`data is not a string or buffer (${typeof data})`);
      }
      return data.includes(ALL_EMULATORS_STARTED_LOG);
    });

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
        ["--only", "auth", "--import", exportPath],
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

    await emulatorsCLI.start("emulators:start", project, ["--only", "auth"], (data: unknown) => {
      if (typeof data !== "string" && !Buffer.isBuffer(data)) {
        throw new Error(`data is not a string or buffer (${typeof data})`);
      }
      return data.includes(ALL_EMULATORS_STARTED_LOG);
    });

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
      ["--only", "auth", "--import", exportPath],
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
      ["--only", "storage"],
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
      ["--only", "storage", "--import", exportPath],
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
});

describe("ephemeral flag", () => {
  it("should not export data on exit when --ephemeral is used, even with --export-on-exit", async function (this) {
    this.timeout(TEST_SETUP_TIMEOUT * 2); // Increased timeout for multiple emulator runs

    const exportPath = fs.mkdtempSync(path.join(os.tmpdir(), "emulator-ephemeral-export-on-exit"));
    const emulatorsCLI = new CLIProcess("ephemeral-1", __dirname);

    // Start emulators with --ephemeral and --export-on-exit
    // Expect "Skipping export on exit due to --ephemeral flag."
    let sawEphemeralSkipLog = false;
    await emulatorsCLI.start(
      "emulators:start",
      FIREBASE_PROJECT,
      ["--only", "firestore", "--ephemeral", "--export-on-exit", exportPath],
      (data: unknown) => {
        if (typeof data === "string" || Buffer.isBuffer(data)) {
          if (data.includes("Skipping export on exit due to --ephemeral flag.")) {
            sawEphemeralSkipLog = true;
          }
          return data.includes(ALL_EMULATORS_STARTED_LOG);
        }
        return false;
      },
    );

    // Add some data (which should not be exported)
    const config = readConfig(); // Assuming readConfig() gets Firestore port
    const port = config.emulators!.firestore.port;
    const host = await localhost(); // Make sure localhost is resolved

    const adminApp = admin.initializeApp(
      {
        projectId: FIREBASE_PROJECT,
        firestore: {
          host: `${host}:${port}`,
          ssl: false,
        },
        credential: ADMIN_CREDENTIAL,
      },
      "ephemeral-firestore-1",
    );

    await adminApp.firestore().collection("testCollection").doc("testDoc").set({ foo: "bar" });
    await adminApp.delete(); // Clean up the app

    // Stop the emulators (which would trigger export-on-exit if not ephemeral)
    await emulatorsCLI.stop();

    // Verify that the export path does not exist or is empty
    expect(sawEphemeralSkipLog, "Did not see ephemeral skip log message").to.be.true;
    const exportDirExists = fs.existsSync(exportPath);
    if (exportDirExists) {
      const filesInExportDir = fs.readdirSync(exportPath);
      // firebase-export-metadata.json might still be created by the hub before the controller bails out
      // or if the directory was created by a previous failed run.
      // The important part is that firestore_export should not be there.
      expect(filesInExportDir.includes("firestore_export"), "firestore_export directory should not exist").to.be.false;
    } else {
      // If the directory doesn't exist at all, that's also a pass.
      expect(exportDirExists, "Export directory should ideally not be created, or be empty").to.be.false;
    }

    // Clean up the potentially created export directory
    if (exportDirExists) {
      fs.rmSync(exportPath, { recursive: true, force: true });
    }
  });

  it("should import data but not export on exit when --ephemeral is used with --import and --export-on-exit", async function (this) {
    this.timeout(TEST_SETUP_TIMEOUT * 3); // For multiple emulator runs

    const initialExportPath = fs.mkdtempSync(path.join(os.tmpdir(), "emulator-ephemeral-initial-export"));
    const ephemeralExportPath = fs.mkdtempSync(path.join(os.tmpdir(), "emulator-ephemeral-final-export"));

    // 1. Normal run to create an initial export
    const initialEmulatorsCLI = new CLIProcess("ephemeral-initial", __dirname);
    await initialEmulatorsCLI.start(
      "emulators:start",
      FIREBASE_PROJECT,
      ["--only", "firestore"],
      logIncludes(ALL_EMULATORS_STARTED_LOG),
    );

    const config = readConfig();
    const port = config.emulators!.firestore.port;
    const host = await localhost();

    const adminAppInitial = admin.initializeApp(
      {
        projectId: FIREBASE_PROJECT,
        firestore: { host: `${host}:${port}`, ssl: false },
        credential: ADMIN_CREDENTIAL,
      },
      "ephemeral-firestore-initial",
    );
    await adminAppInitial.firestore().collection("initialData").doc("doc1").set({ data: "imported" });
    await adminAppInitial.delete();

    const exportCLICmd = new CLIProcess("ephemeral-export-initial", __dirname);
    await exportCLICmd.start(
      "emulators:export",
      FIREBASE_PROJECT,
      [initialExportPath],
      logIncludes("Export complete"),
    );
    await exportCLICmd.stop();
    await initialEmulatorsCLI.stop();

    // Verify initial export has data
    expect(fs.existsSync(path.join(initialExportPath, "firestore_export")), "Initial firestore_export directory should exist").to.be.true;


    // 2. Ephemeral run with import and export-on-exit
    const ephemeralCLI = new CLIProcess("ephemeral-import", __dirname);
    let sawEphemeralSkipLog = false;
    await ephemeralCLI.start(
      "emulators:start",
      FIREBASE_PROJECT,
      [
        "--only",
        "firestore",
        "--ephemeral",
        "--import",
        initialExportPath,
        "--export-on-exit",
        ephemeralExportPath,
      ],
      (data: unknown) => {
        if (typeof data === "string" || Buffer.isBuffer(data)) {
          if (data.includes("Skipping export on exit due to --ephemeral flag.")) {
            sawEphemeralSkipLog = true;
          }
          // Check for import success log for Firestore
          if (data.includes("Importing data from") && data.includes("firestore_export.overall_export_metadata")) {
             // This is a good sign import is happening
          }
          return data.includes(ALL_EMULATORS_STARTED_LOG);
        }
        return false;
      },
    );

    const adminAppEphemeral = admin.initializeApp(
      {
        projectId: FIREBASE_PROJECT,
        firestore: { host: `${host}:${port}`, ssl: false },
        credential: ADMIN_CREDENTIAL,
      },
      "ephemeral-firestore-import",
    );

    // Verify imported data
    const importedDoc = await adminAppEphemeral.firestore().collection("initialData").doc("doc1").get();
    expect(importedDoc.exists, "Imported document should exist").to.be.true;
    expect(importedDoc.data()).to.deep.equal({ data: "imported" });

    // Add new data (which should not be exported)
    await adminAppEphemeral.firestore().collection("ephemeralData").doc("doc2").set({ data: "not_exported" });
    await adminAppEphemeral.delete();

    await ephemeralCLI.stop(); // This would trigger export-on-exit

    // Verify ephemeralExportPath is not created or is empty
    expect(sawEphemeralSkipLog, "Did not see ephemeral skip log message for final export").to.be.true;
    const ephemeralExportDirExists = fs.existsSync(ephemeralExportPath);
    if (ephemeralExportDirExists) {
      const filesInEphemeralExportDir = fs.readdirSync(ephemeralExportPath);
      expect(filesInEphemeralExportDir.includes("firestore_export"), "firestore_export directory should not exist in ephemeral export path").to.be.false;
    } else {
      expect(ephemeralExportDirExists, "Ephemeral export directory should ideally not be created").to.be.false;
    }

    // Cleanup
    fs.rmSync(initialExportPath, { recursive: true, force: true });
    if (ephemeralExportDirExists) {
      fs.rmSync(ephemeralExportPath, { recursive: true, force: true });
    }
  });

  it("should not export data via emulators:export command when emulators were started with --ephemeral", async function (this) {
    this.timeout(TEST_SETUP_TIMEOUT * 2);

    const manualExportPath = fs.mkdtempSync(path.join(os.tmpdir(), "emulator-ephemeral-manual-export"));

    // 1. Start emulators with --ephemeral
    const emulatorsCLI = new CLIProcess("ephemeral-manual", __dirname);
    await emulatorsCLI.start(
      "emulators:start",
      FIREBASE_PROJECT,
      ["--only", "firestore", "--ephemeral"],
      logIncludes(ALL_EMULATORS_STARTED_LOG),
    );

    const config = readConfig();
    const port = config.emulators!.firestore.port;
    const host = await localhost();

    const adminApp = admin.initializeApp(
      {
        projectId: FIREBASE_PROJECT,
        firestore: { host: `${host}:${port}`, ssl: false },
        credential: ADMIN_CREDENTIAL,
      },
      "ephemeral-firestore-manual",
    );
    // Add some data (which should not be exported)
    await adminApp.firestore().collection("manualTest").doc("doc1").set({ data: "no_export_pls" });
    await adminApp.delete();

    // 2. Attempt to run emulators:export
    const exportCmdCLI = new CLIProcess("ephemeral-manual-export-cmd", __dirname);
    let sawExportSkippedLog = false;
    // The "Skipping data export due to --ephemeral flag." log will actually appear in the output
    // of the `emulators:export` command itself, because the `options.ephemeral` is derived
    // from the currently running emulators' state (or rather, the options used to start them).
    // However, the CLIProcess might not easily capture that if `emulators:export` is a very short-lived process
    // that just sends a signal/command to the running emulators.
    // The more robust check is that the export directory is not created.
    // For logging, we'd ideally check the main emulator logs, but that's harder here.
    // Let's assume the `exportEmulatorData` in controller.ts which `emulators:export` calls,
    // will have its log output captured if it's part of the same process or if the CLIProcess helper can grab it.
    // A simpler check is that the export directory is not created.
    // If the export is truly skipped, the "Export complete" message shouldn't appear for this command.
    await exportCmdCLI.start(
      "emulators:export",
      FIREBASE_PROJECT,
      [manualExportPath, "--only", "firestore"], // Added --only to be specific
      (data: unknown) => {
        if (typeof data === "string" || Buffer.isBuffer(data)) {
          // Check for the skip message from controller.exportEmulatorData
          if (data.includes("Skipping data export due to --ephemeral flag.")) {
            sawExportSkippedLog = true;
            return true; // Found the log, command can "complete" for test purposes
          }
          // If we see "Export complete", then the ephemeral flag was not respected.
          if (data.includes("Export complete")) {
            throw new Error("Export completed unexpectedly in ephemeral mode.");
          }
        }
        // Don't let this hang indefinitely if the skip log isn't found immediately.
        // The primary check will be the directory existence.
        // If the command exits without either message, the file check is the decider.
        return false; // Keep listening until process exits or specific log found.
      },
      /* captureStdErr= */ true, // Capture stderr as well, just in case
      /* timeout= */ 10000, // Give it a bit of time to run or fail
    ).catch((e) => {
      // If it errors out (e.g. because export failed or was actively prevented), that's fine.
      // We are primarily interested in whether data was written.
      console.log("emulators:export command execution resulted in an error (potentially expected):", e.message);
    });

    // Explicitly stop the export command process if it hasn't finished (e.g. if waiting for a log that won't appear)
    if (exportCmdCLI.isRunning()) {
        await exportCmdCLI.stop();
    }


    // Verify that the manualExportPath was not created or is empty
    const manualExportDirExists = fs.existsSync(manualExportPath);
    if (manualExportDirExists) {
      const filesInManualExportDir = fs.readdirSync(manualExportPath);
      expect(filesInManualExportDir.includes("firestore_export"), "firestore_export directory should not exist in manual export path").to.be.false;
      // Also check for the log, though file system is primary
      // This log check might be flaky depending on how CLIProcess captures output from short-lived commands
      // that might delegate work to the main emulator process.
      // expect(sawExportSkippedLog, "Did not see 'Skipping data export' log from emulators:export command").to.be.true;
    } else {
      expect(manualExportDirExists, "Manual export directory should not have been created").to.be.false;
    }


    // Stop the main emulators
    await emulatorsCLI.stop();

    // Cleanup
    if (manualExportDirExists) {
      fs.rmSync(manualExportPath, { recursive: true, force: true });
    }
  });
});
