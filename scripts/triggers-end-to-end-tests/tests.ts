import { expect } from "chai";
import * as admin from "firebase-admin";
import { Firestore } from "@google-cloud/firestore";
import * as fs from "fs";
import * as path from "path";

import { FrameworkOptions, TriggerEndToEndTest } from "../integration-helpers/framework";

const FIREBASE_PROJECT = process.env.FBTOOLS_TARGET_PROJECT || "";
const ADMIN_CREDENTIAL = {
  getAccessToken: () => {
    return Promise.resolve({
      expires_in: 1000000,
      access_token: "owner",
    });
  },
};

/*
 * Various delays that are needed because this test spawns
 * parallel emulator subprocesses.
 */
const TEST_SETUP_TIMEOUT = 80000;
const EMULATORS_WRITE_DELAY_MS = 5000;
const EMULATORS_SHUTDOWN_DELAY_MS = 7000;
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

describe("function triggers", () => {
  let test: TriggerEndToEndTest;
  let database: admin.database.Database | undefined;
  let firestore: admin.firestore.Firestore | undefined;
  const firestoreUnsub: Array<() => void> = [];

  before(async function (this) {
    this.timeout(TEST_SETUP_TIMEOUT);

    expect(FIREBASE_PROJECT).to.exist.and.not.be.empty;

    const config = readConfig();
    test = new TriggerEndToEndTest(FIREBASE_PROJECT, __dirname, config);
    await test.startEmulators(["--only", "functions,database,firestore,pubsub,storage,auth"]);

    firestore = new Firestore({
      port: test.firestoreEmulatorPort,
      projectId: FIREBASE_PROJECT,
      servicePath: "127.0.0.1",
      ssl: false,
    });

    admin.initializeApp({
      projectId: FIREBASE_PROJECT,
      databaseURL: `http://127.0.0.1:${test.rtdbEmulatorPort}?ns=${FIREBASE_PROJECT}`,
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
      },
    );

    database.ref(DATABASE_COMPLETION_MARKER).on(
      "value",
      (/* snap */) => {
        test.rtdbFromRtdb = true;
      },
      (err: Error) => {
        expect.fail(err, `Error reading ${DATABASE_COMPLETION_MARKER} from database emulator.`);
      },
    );

    let unsub = firestore.doc(FIRESTORE_COMPLETION_MARKER).onSnapshot(
      (/* snap */) => {
        test.firestoreFromFirestore = true;
      },
      (err: Error) => {
        expect.fail(err, `Error reading ${FIRESTORE_COMPLETION_MARKER} from firestore emulator.`);
      },
    );
    firestoreUnsub.push(unsub);

    unsub = firestore.doc(DATABASE_COMPLETION_MARKER).onSnapshot(
      (/* snap */) => {
        test.firestoreFromRtdb = true;
      },
      (err: Error) => {
        expect.fail(err, `Error reading ${DATABASE_COMPLETION_MARKER} from firestore emulator.`);
      },
    );
    firestoreUnsub.push(unsub);
  });

  after(async function (this) {
    this.timeout(EMULATORS_SHUTDOWN_DELAY_MS);
    database?.goOffline();
    for (const fn of firestoreUnsub) fn();
    await firestore?.terminate();
    await test.stopEmulators();
  });

  describe("https triggers", () => {
    it("should handle parallel requests", async function (this) {
      this.timeout(TEST_SETUP_TIMEOUT);

      const [resp1, resp2] = await Promise.all([
        test.invokeHttpFunction("httpsv2reaction"),
        test.invokeHttpFunction("httpsv2reaction"),
      ]);

      expect(resp1.status).to.eq(200);
      expect(resp2.status).to.eq(200);
    });
  });

  describe("database and firestore emulator triggers", () => {
    it("should write to the database emulator", async function (this) {
      this.timeout(EMULATOR_TEST_TIMEOUT);

      const response = await test.writeToRtdb();
      expect(response.status).to.equal(200);
    });

    it("should write to the firestore emulator", async function (this) {
      this.timeout(EMULATOR_TEST_TIMEOUT * 2);

      const response = await test.writeToFirestore();
      expect(response.status).to.equal(200);

      /*
       * We delay again here because the functions triggered
       * by the previous two writes run parallel to this and
       * we need to give them and previous installed test
       * fixture state handlers to complete before we check
       * that state in the next test.
       */
      await new Promise((resolve) => setTimeout(resolve, EMULATORS_WRITE_DELAY_MS * 2));
    });

    it("should have have triggered cloud functions", () => {
      expect(test.rtdbTriggerCount).to.equal(1);
      expect(test.rtdbV2TriggerCount).to.eq(1);
      expect(test.firestoreTriggerCount).to.equal(1);
      expect(test.firestoreV2TriggerCount).to.equal(1);
      /*
       * Check for the presence of all expected documents in the firestore
       * and database emulators.
       */
      expect(test.success()).to.equal(true);
    });
  });

  describe("pubsub emulator triggered functions", () => {
    it("should write to the pubsub emulator", async function (this) {
      this.timeout(EMULATOR_TEST_TIMEOUT);

      const response = await test.writeToPubsub();
      expect(response.status).to.equal(200);
      await new Promise((resolve) => setTimeout(resolve, EMULATORS_WRITE_DELAY_MS));
    });

    it("should have have triggered cloud functions", () => {
      expect(test.pubsubTriggerCount).to.equal(1);
      expect(test.pubsubV2TriggerCount).to.equal(1);
    });

    it("should write to the scheduled pubsub emulator", async function (this) {
      this.timeout(EMULATOR_TEST_TIMEOUT);

      const response = await test.writeToScheduledPubsub();
      expect(response.status).to.equal(200);
      await new Promise((resolve) => setTimeout(resolve, EMULATORS_WRITE_DELAY_MS));
    });

    it("should have have triggered cloud functions", () => {
      expect(test.pubsubTriggerCount).to.equal(2);
    });
  });

  describe("auth emulator triggered functions", () => {
    it("should write to the auth emulator", async function (this) {
      this.timeout(EMULATOR_TEST_TIMEOUT);
      const response = await test.writeToAuth();
      expect(response.status).to.equal(200);
      await new Promise((resolve) => setTimeout(resolve, EMULATORS_WRITE_DELAY_MS));
    });

    it("should have have triggered cloud functions", () => {
      expect(test.authTriggerCount).to.equal(1);
    });

    it("should create a user in the auth emulator", async function (this) {
      this.timeout(EMULATOR_TEST_TIMEOUT * 2);
      const response = await test.createUserFromAuth();
      expect(response.status).to.equal(200);
      await new Promise((resolve) => setTimeout(resolve, EMULATORS_WRITE_DELAY_MS));
    });

    it("should have triggered cloud functions", () => {
      expect(test.authBlockingCreateV2TriggerCount).to.equal(1);
      // Creating a User also triggers the before sign in trigger
      expect(test.authBlockingSignInV2TriggerCount).to.equal(1);
    });

    it("should sign in a user in the auth emulator", async function (this) {
      this.timeout(EMULATOR_TEST_TIMEOUT * 2);
      const response = await test.signInUserFromAuth();
      expect(response.status).to.equal(200);
      await new Promise((resolve) => setTimeout(resolve, EMULATORS_WRITE_DELAY_MS));
    });

    it("should have triggered cloud functions", () => {
      expect(test.authBlockingSignInV2TriggerCount).to.equal(2);
    });
  });

  describe("storage emulator triggered functions", () => {
    it("should write to the default bucket of storage emulator", async function (this) {
      this.timeout(EMULATOR_TEST_TIMEOUT);

      const response = await test.writeToDefaultStorage();
      expect(response.status).to.equal(200);
      await new Promise((resolve) => setTimeout(resolve, EMULATORS_WRITE_DELAY_MS));
    });

    it("should have triggered cloud functions", () => {
      /* on object create one event fires (finalize) */
      // default bucket
      expect(test.storageFinalizedTriggerCount).to.equal(1);
      expect(test.storageV2FinalizedTriggerCount).to.equal(1);
      expect(test.storageMetadataTriggerCount).to.equal(0);
      expect(test.storageV2MetadataTriggerCount).to.equal(0);
      expect(test.storageDeletedTriggerCount).to.equal(0);
      expect(test.storageV2DeletedTriggerCount).to.equal(0);
      // specific bucket
      expect(test.storageBucketFinalizedTriggerCount).to.equal(0);
      expect(test.storageBucketV2FinalizedTriggerCount).to.equal(0);
      expect(test.storageBucketMetadataTriggerCount).to.equal(0);
      expect(test.storageBucketV2MetadataTriggerCount).to.equal(0);
      expect(test.storageBucketDeletedTriggerCount).to.equal(0);
      expect(test.storageBucketV2DeletedTriggerCount).to.equal(0);
      test.resetCounts();
    });

    it("should write to a specific bucket of storage emulator", async function (this) {
      this.timeout(EMULATOR_TEST_TIMEOUT);

      const response = await test.writeToSpecificStorageBucket();
      expect(response.status).to.equal(200);
      await new Promise((resolve) => setTimeout(resolve, EMULATORS_WRITE_DELAY_MS));
    });

    it("should have triggered cloud functions", () => {
      /* on object create one event fires (finalize) */
      // default bucket
      expect(test.storageFinalizedTriggerCount).to.equal(0);
      expect(test.storageV2FinalizedTriggerCount).to.equal(0);
      expect(test.storageMetadataTriggerCount).to.equal(0);
      expect(test.storageV2MetadataTriggerCount).to.equal(0);
      expect(test.storageDeletedTriggerCount).to.equal(0);
      expect(test.storageV2DeletedTriggerCount).to.equal(0);
      // specific bucket
      expect(test.storageBucketFinalizedTriggerCount).to.equal(1);
      expect(test.storageBucketV2FinalizedTriggerCount).to.equal(1);
      expect(test.storageBucketMetadataTriggerCount).to.equal(0);
      expect(test.storageBucketV2MetadataTriggerCount).to.equal(0);
      expect(test.storageBucketDeletedTriggerCount).to.equal(0);
      expect(test.storageBucketV2DeletedTriggerCount).to.equal(0);
      test.resetCounts();
    });

    it("should write and update metadata from the default bucket of the storage emulator", async function (this) {
      this.timeout(EMULATOR_TEST_TIMEOUT);

      const response = await test.updateMetadataDefaultStorage();
      expect(response.status).to.equal(200);
      await new Promise((resolve) => setTimeout(resolve, EMULATORS_WRITE_DELAY_MS));
    });

    it("should have triggered cloud functions", () => {
      /* on object create one event fires (finalize) */
      /* on update one event fires (metadataUpdate) */
      // default bucket
      expect(test.storageFinalizedTriggerCount).to.equal(1);
      expect(test.storageV2FinalizedTriggerCount).to.equal(1);
      expect(test.storageMetadataTriggerCount).to.equal(1);
      expect(test.storageV2MetadataTriggerCount).to.equal(1);
      expect(test.storageDeletedTriggerCount).to.equal(0);
      expect(test.storageV2DeletedTriggerCount).to.equal(0);
      // specific bucket
      expect(test.storageBucketFinalizedTriggerCount).to.equal(0);
      expect(test.storageBucketV2FinalizedTriggerCount).to.equal(0);
      expect(test.storageBucketMetadataTriggerCount).to.equal(0);
      expect(test.storageBucketV2MetadataTriggerCount).to.equal(0);
      expect(test.storageBucketDeletedTriggerCount).to.equal(0);
      expect(test.storageBucketV2DeletedTriggerCount).to.equal(0);
      test.resetCounts();
    });

    it("should write and update metadata from a specific bucket of the storage emulator", async function (this) {
      this.timeout(EMULATOR_TEST_TIMEOUT);

      const response = await test.updateMetadataSpecificStorageBucket();
      expect(response.status).to.equal(200);
      await new Promise((resolve) => setTimeout(resolve, EMULATORS_WRITE_DELAY_MS));
    });

    it("should have triggered cloud functions", () => {
      /* on object create one event fires (finalize) */
      /* on update one event fires (metadataUpdate) */
      // default bucket
      expect(test.storageFinalizedTriggerCount).to.equal(0);
      expect(test.storageV2FinalizedTriggerCount).to.equal(0);
      expect(test.storageMetadataTriggerCount).to.equal(0);
      expect(test.storageV2MetadataTriggerCount).to.equal(0);
      expect(test.storageDeletedTriggerCount).to.equal(0);
      expect(test.storageV2DeletedTriggerCount).to.equal(0);
      // specific bucket
      expect(test.storageBucketFinalizedTriggerCount).to.equal(1);
      expect(test.storageBucketV2FinalizedTriggerCount).to.equal(1);
      expect(test.storageBucketMetadataTriggerCount).to.equal(1);
      expect(test.storageBucketV2MetadataTriggerCount).to.equal(1);
      expect(test.storageBucketDeletedTriggerCount).to.equal(0);
      expect(test.storageBucketV2DeletedTriggerCount).to.equal(0);
      test.resetCounts();
    });

    it("should write and delete from the default bucket of the storage emulator", async function (this) {
      this.timeout(EMULATOR_TEST_TIMEOUT);

      const response = await test.updateDeleteFromDefaultStorage();
      expect(response.status).to.equal(200);
      await new Promise((resolve) => setTimeout(resolve, EMULATORS_WRITE_DELAY_MS));
    });

    it("should have triggered cloud functions", () => {
      /* on create one event fires (finalize) */
      /* on delete one event fires (delete) */
      // default bucket
      expect(test.storageFinalizedTriggerCount).to.equal(1);
      expect(test.storageV2FinalizedTriggerCount).to.equal(1);
      expect(test.storageMetadataTriggerCount).to.equal(0);
      expect(test.storageV2MetadataTriggerCount).to.equal(0);
      expect(test.storageDeletedTriggerCount).to.equal(1);
      expect(test.storageV2DeletedTriggerCount).to.equal(1);
      // specific bucket
      expect(test.storageBucketFinalizedTriggerCount).to.equal(0);
      expect(test.storageBucketV2FinalizedTriggerCount).to.equal(0);
      expect(test.storageBucketMetadataTriggerCount).to.equal(0);
      expect(test.storageBucketV2MetadataTriggerCount).to.equal(0);
      expect(test.storageBucketDeletedTriggerCount).to.equal(0);
      expect(test.storageBucketV2DeletedTriggerCount).to.equal(0);
      test.resetCounts();
    });

    it("should write and delete from a specific bucket of the storage emulator", async function (this) {
      this.timeout(EMULATOR_TEST_TIMEOUT);

      const response = await test.updateDeleteFromSpecificStorageBucket();
      expect(response.status).to.equal(200);
      await new Promise((resolve) => setTimeout(resolve, EMULATORS_WRITE_DELAY_MS));
    });

    it("should have triggered cloud functions", () => {
      /* on create one event fires (finalize) */
      /* on delete one event fires (delete) */
      // default bucket
      expect(test.storageFinalizedTriggerCount).to.equal(0);
      expect(test.storageV2FinalizedTriggerCount).to.equal(0);
      expect(test.storageMetadataTriggerCount).to.equal(0);
      expect(test.storageV2MetadataTriggerCount).to.equal(0);
      expect(test.storageDeletedTriggerCount).to.equal(0);
      expect(test.storageV2DeletedTriggerCount).to.equal(0);
      // specific bucket
      expect(test.storageBucketFinalizedTriggerCount).to.equal(1);
      expect(test.storageBucketV2FinalizedTriggerCount).to.equal(1);
      expect(test.storageBucketMetadataTriggerCount).to.equal(0);
      expect(test.storageBucketV2MetadataTriggerCount).to.equal(0);
      expect(test.storageBucketDeletedTriggerCount).to.equal(1);
      expect(test.storageBucketV2DeletedTriggerCount).to.equal(1);
      test.resetCounts();
    });
  });

  describe("callable functions", () => {
    it("should make a call to v1 callable function", async function (this) {
      this.timeout(EMULATOR_TEST_TIMEOUT);

      const response = await test.invokeCallableFunction("onCall", { data: "foobar" });
      expect(response.status).to.equal(200);
      const body = await response.json();
      expect(body).to.deep.equal({ result: "foobar" });
    });

    it("should make a call to v2 callable function", async function (this) {
      this.timeout(EMULATOR_TEST_TIMEOUT);

      const response = await test.invokeCallableFunction("oncallv2", { data: "foobar" });
      expect(response.status).to.equal(200);
      const body = await response.json();
      expect(body).to.deep.equal({ result: "foobar" });
    });
  });

  it("should enforce timeout", async function (this) {
    this.timeout(TEST_SETUP_TIMEOUT);
    const v2response = await test.invokeHttpFunction("onreqv2timeout");
    expect(v2response.status).to.equal(500);
  });

  describe("disable/enableBackgroundTriggers", () => {
    before(() => {
      test.resetCounts();
    });

    it("should disable background triggers", async function (this) {
      this.timeout(TEST_SETUP_TIMEOUT);

      const response = await test.disableBackgroundTriggers();
      expect(response.status).to.equal(200);

      await new Promise((resolve) => setTimeout(resolve, EMULATORS_WRITE_DELAY_MS));

      await Promise.all([
        // TODO(danielylee): Trying to respond to all triggers at once often results in Functions
        // Emulator hanging indefinitely. Only triggering 1 trigger for now. Re-enable other triggers
        // once the root cause is identified.
        // test.writeToRtdb(),
        // test.writeToFirestore(),
        // test.writeToPubsub(),
        // test.writeToDefaultStorage(),
        test.writeToAuth(),
      ]);

      await new Promise((resolve) => setTimeout(resolve, EMULATORS_WRITE_DELAY_MS * 2));

      // expect(test.rtdbTriggerCount).to.equal(0);
      // expect(test.rtdbV2TriggerCount).to.eq(0);
      // expect(test.firestoreTriggerCount).to.equal(0);
      // expect(test.pubsubTriggerCount).to.equal(0);
      // expect(test.pubsubV2TriggerCount).to.equal(0);
      expect(test.authTriggerCount).to.equal(0);
    });

    it("should re-enable background triggers", async function (this) {
      this.timeout(TEST_SETUP_TIMEOUT);

      const response = await test.enableBackgroundTriggers();
      expect(response.status).to.equal(200);

      await new Promise((resolve) => setTimeout(resolve, EMULATORS_WRITE_DELAY_MS));

      await Promise.all([
        // TODO(danielylee): Trying to respond to all triggers at once often results in Functions
        // Emulator hanging indefinitely. Only triggering 1 trigger for now. Re-enable other triggers
        // once the root cause is identified.
        // test.writeToRtdb(),
        // test.writeToFirestore(),
        // test.writeToPubsub(),
        // test.writeToDefaultStorage(),
        test.writeToAuth(),
      ]);

      await new Promise((resolve) => setTimeout(resolve, EMULATORS_WRITE_DELAY_MS * 3));
      // TODO(danielylee): Trying to respond to all triggers at once often results in Functions
      // Emulator hanging indefinitely. Only triggering 1 trigger for now. Re-enable other triggers
      // once the root cause is identified.
      // expect(test.rtdbTriggerCount).to.equal(1);
      // expect(test.rtdbV2TriggerCount).to.eq(1);
      // expect(test.firestoreTriggerCount).to.equal(1);
      // expect(test.pubsubTriggerCount).to.equal(1);
      // expect(test.pubsubV2TriggerCount).to.equal(1);
      expect(test.authTriggerCount).to.equal(1);
    });
  });
});
