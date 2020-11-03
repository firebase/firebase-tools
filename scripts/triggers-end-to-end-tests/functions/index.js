const admin = require("firebase-admin");
const functions = require("firebase-functions");
const { PubSub } = require("@google-cloud/pubsub");

/*
 * Log snippets that the driver program above checks for. Be sure to update
 * ../test.js if you plan on changing these.
 */
const RTDB_FUNCTION_LOG = "========== RTDB FUNCTION ==========";
const FIRESTORE_FUNCTION_LOG = "========== FIRESTORE FUNCTION ==========";
const PUBSUB_FUNCTION_LOG = "========== PUBSUB FUNCTION ==========";
const AUTH_FUNCTION_LOG = "========== AUTH FUNCTION ==========";

/*
 * We install onWrite triggers for START_DOCUMENT_NAME in both the firestore and
 * database emulators. From each respective onWrite trigger, we write a document
 * to both the firestore and database emulators. This exercises the
 * bidirectional communication between cloud functions and each emulator.
 */
const START_DOCUMENT_NAME = "test/start";
const END_DOCUMENT_NAME = "test/done";

const PUBSUB_TOPIC = "test-topic";
const PUBSUB_SCHEDULED_TOPIC = "firebase-schedule-pubsubScheduled";

const pubsub = new PubSub();
admin.initializeApp();

exports.deleteFromFirestore = functions.https.onRequest(async (req, res) => {
  await admin
    .firestore()
    .doc(START_DOCUMENT_NAME)
    .delete();
  res.json({ deleted: true });
});

exports.deleteFromRtdb = functions.https.onRequest(async (req, res) => {
  await admin
    .database()
    .ref(START_DOCUMENT_NAME)
    .remove();
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

exports.firestoreReaction = functions.firestore
  .document(START_DOCUMENT_NAME)
  .onWrite(async (/* change, ctx */) => {
    console.log(FIRESTORE_FUNCTION_LOG);
    /*
     * Write back a completion timestamp to the firestore emulator. The test
     * driver program checks for this by querying the firestore emulator
     * directly.
     */
    const ref = admin.firestore().doc(END_DOCUMENT_NAME + "_from_firestore");
    await ref.set({ done: new Date().toISOString() });

    /*
     * Write a completion marker to the firestore emulator. This exercise
     * cross-emulator communication.
     */
    const dbref = admin.database().ref(END_DOCUMENT_NAME + "_from_firestore");
    await dbref.set({ done: new Date().toISOString() });

    return true;
  });

exports.rtdbReaction = functions.database
  .ref(START_DOCUMENT_NAME)
  .onWrite(async (/* change, ctx */) => {
    console.log(RTDB_FUNCTION_LOG);

    const ref = admin.database().ref(END_DOCUMENT_NAME + "_from_database");
    await ref.set({ done: new Date().toISOString() });

    const firestoreref = admin.firestore().doc(END_DOCUMENT_NAME + "_from_database");
    await firestoreref.set({ done: new Date().toISOString() });

    return true;
  });

exports.pubsubReaction = functions.pubsub.topic(PUBSUB_TOPIC).onPublish((msg /* , ctx */) => {
  console.log(PUBSUB_FUNCTION_LOG);
  console.log("Message", JSON.stringify(msg.json));
  console.log("Attributes", JSON.stringify(msg.attributes));
  return true;
});

exports.pubsubScheduled = functions.pubsub.schedule("every mon 07:00").onRun((context) => {
  console.log(PUBSUB_FUNCTION_LOG);
  console.log("Resource", JSON.stringify(context.resource));
  return true;
});

exports.authReaction = functions.auth.user().onCreate((user, ctx) => {
  console.log(AUTH_FUNCTION_LOG);
  console.log("User", JSON.stringify(user));
  return true;
});
