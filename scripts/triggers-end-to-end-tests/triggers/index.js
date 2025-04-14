const admin = require("firebase-admin");
const functions = require("firebase-functions");
const { PubSub } = require("@google-cloud/pubsub");
const { initializeApp } = require("firebase/app");
const {
  getAuth,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} = require("firebase/auth");

const FIREBASE_PROJECT = process.env.FBTOOLS_TARGET_PROJECT || "";

/*
 * We install onWrite triggers for START_DOCUMENT_NAME in both the firestore and
 * database emulators. From each respective onWrite trigger, we write a document
 * to both the firestore and database emulators. This exercises the
 * bidirectional communication between cloud functions and each emulator.
 */
const START_DOCUMENT_NAME = "test/start";

const PUBSUB_TOPIC = "test-topic";
const PUBSUB_SCHEDULED_TOPIC = "firebase-schedule-pubsubScheduled";

const STORAGE_FILE_NAME = "test-file.txt";

const pubsub = new PubSub();

// init the Firebase Admin SDK
admin.initializeApp();

// init the Firebase JS SDK
const app = initializeApp(
  {
    apiKey: "fake-api-key",
    projectId: `${FIREBASE_PROJECT}`,
    authDomain: `${FIREBASE_PROJECT}.firebaseapp.com`,
    storageBucket: `${FIREBASE_PROJECT}.appspot.com`,
    appId: "fake-app-id",
  },
  "TRIGGERS_END_TO_END",
);
const auth = getAuth(app);
connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`);

exports.deleteFromFirestore = functions.https.onRequest(async (req, res) => {
  await admin.firestore().doc(START_DOCUMENT_NAME).delete();
  res.json({ deleted: true });
});

exports.deleteFromRtdb = functions.https.onRequest(async (req, res) => {
  await admin.database().ref(START_DOCUMENT_NAME).remove();
  res.json({ deleted: true });
});

exports.writeToFirestore = functions.https.onRequest(async (req, res) => {
  const ref = admin.firestore().doc(START_DOCUMENT_NAME);
  await ref.set({ start: new Date().toISOString() });
  ref.get().then((snap) => {
    res.json({ data: snap.data() });
  });
});

exports.writeToRtdb = functions.https.onRequest(async (req, res) => {
  const ref = admin.database().ref(START_DOCUMENT_NAME);
  await ref.set({ start: new Date().toISOString() });
  ref.once("value", (snap) => {
    res.json({ data: snap });
  });
});

exports.writeToPubsub = functions.https.onRequest(async (req, res) => {
  const msg = await pubsub.topic(PUBSUB_TOPIC).publishJSON({ foo: "bar" }, { attr: "val" });
  console.log("PubSub Emulator Host", process.env.PUBSUB_EMULATOR_HOST);
  console.log("Wrote PubSub Message", msg);
  res.json({ published: "ok" });
});

exports.writeToScheduledPubsub = functions.https.onRequest(async (req, res) => {
  const msg = await pubsub
    .topic(PUBSUB_SCHEDULED_TOPIC)
    .publishJSON({ foo: "bar" }, { attr: "val" });
  console.log("PubSub Emulator Host", process.env.PUBSUB_EMULATOR_HOST);
  console.log("Wrote Scheduled PubSub Message", msg);
  res.json({ published: "ok" });
});

exports.writeToAuth = functions.https.onRequest(async (req, res) => {
  const time = new Date().getTime();
  await admin.auth().createUser({
    uid: `uid${time}`,
    email: `user${time}@example.com`,
  });

  res.json({ created: "ok" });
});

exports.createUserFromAuth = functions.https.onRequest(async (req, res) => {
  await createUserWithEmailAndPassword(auth, "email@gmail.com", "mypassword");

  res.json({ created: "ok" });
});

exports.signInUserFromAuth = functions.https.onRequest(async (req, res) => {
  await signInWithEmailAndPassword(auth, "email@gmail.com", "mypassword");

  res.json({ done: "ok" });
});

exports.writeToDefaultStorage = functions.https.onRequest(async (req, res) => {
  await admin.storage().bucket().file(STORAGE_FILE_NAME).save("hello world!");
  console.log("Wrote to default Storage bucket");
  res.json({ created: "ok" });
});

exports.writeToSpecificStorageBucket = functions.https.onRequest(async (req, res) => {
  await admin.storage().bucket("test-bucket").file(STORAGE_FILE_NAME).save("hello world!");
  console.log("Wrote to a specific Storage bucket");
  res.json({ created: "ok" });
});

exports.updateMetadataFromDefaultStorage = functions.https.onRequest(async (req, res) => {
  await admin.storage().bucket().file(STORAGE_FILE_NAME).save("hello metadata update!");
  console.log("Wrote to Storage bucket");
  await admin.storage().bucket().file(STORAGE_FILE_NAME).setMetadata({ somekey: "someval" });
  console.log("Updated metadata of default Storage bucket");
  res.json({ done: "ok" });
});

exports.updateMetadataFromSpecificStorageBucket = functions.https.onRequest(async (req, res) => {
  await admin
    .storage()
    .bucket("test-bucket")
    .file(STORAGE_FILE_NAME)
    .save("hello metadata update!");
  console.log("Wrote to a specific Storage bucket");
  await admin
    .storage()
    .bucket("test-bucket")
    .file(STORAGE_FILE_NAME)
    .setMetadata({ somenewkey: "somenewval" });
  console.log("Updated metadata of a specific Storage bucket");
  res.json({ done: "ok" });
});

exports.updateDeleteFromDefaultStorage = functions.https.onRequest(async (req, res) => {
  await admin.storage().bucket().file(STORAGE_FILE_NAME).save("something new!");
  console.log("Wrote to Storage bucket");
  await admin.storage().bucket().file(STORAGE_FILE_NAME).delete();
  console.log("Deleted from Storage bucket");
  res.json({ done: "ok" });
});

exports.updateDeleteFromSpecificStorageBucket = functions.https.onRequest(async (req, res) => {
  await admin.storage().bucket("test-bucket").file(STORAGE_FILE_NAME).save("something new!");
  console.log("Wrote to a specific Storage bucket");
  await admin.storage().bucket("test-bucket").file(STORAGE_FILE_NAME).delete();
  console.log("Deleted from a specific Storage bucket");
  res.json({ done: "ok" });
});
