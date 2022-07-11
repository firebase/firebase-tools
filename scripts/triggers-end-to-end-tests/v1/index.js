const admin = require("firebase-admin");
const functions = require("firebase-functions");

/*
 * Log snippets that the driver program above checks for. Be sure to update
 * ../test.js if you plan on changing these.
 */
const RTDB_FUNCTION_LOG = "========== RTDB FUNCTION ==========";
const FIRESTORE_FUNCTION_LOG = "========== FIRESTORE FUNCTION ==========";
const PUBSUB_FUNCTION_LOG = "========== PUBSUB FUNCTION ==========";
const AUTH_FUNCTION_LOG = "========== AUTH FUNCTION ==========";
const STORAGE_FUNCTION_ARCHIVED_LOG = "========== STORAGE FUNCTION ARCHIVED ==========";
const STORAGE_FUNCTION_DELETED_LOG = "========== STORAGE FUNCTION DELETED ==========";
const STORAGE_FUNCTION_FINALIZED_LOG = "========== STORAGE FUNCTION FINALIZED ==========";
const STORAGE_FUNCTION_METADATA_LOG = "========== STORAGE FUNCTION METADATA ==========";
const STORAGE_BUCKET_FUNCTION_ARCHIVED_LOG =
  "========== STORAGE BUCKET FUNCTION ARCHIVED ==========";
const STORAGE_BUCKET_FUNCTION_DELETED_LOG = "========== STORAGE BUCKET FUNCTION DELETED ==========";
const STORAGE_BUCKET_FUNCTION_FINALIZED_LOG =
  "========== STORAGE BUCKET FUNCTION FINALIZED ==========";
const STORAGE_BUCKET_FUNCTION_METADATA_LOG =
  "========== STORAGE BUCKET FUNCTION METADATA ==========";

/*
 * We install onWrite triggers for START_DOCUMENT_NAME in both the firestore and
 * database emulators. From each respective onWrite trigger, we write a document
 * to both the firestore and database emulators. This exercises the
 * bidirectional communication between cloud functions and each emulator.
 */
const START_DOCUMENT_NAME = "test/start";
const END_DOCUMENT_NAME = "test/done";

const PUBSUB_TOPIC = "test-topic";

admin.initializeApp();

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

exports.storageArchiveReaction = functions.storage
  .bucket()
  .object()
  .onArchive((object, context) => {
    console.log(STORAGE_FUNCTION_ARCHIVED_LOG);
    console.log("Object", JSON.stringify(object));
    return true;
  });

exports.storageDeleteReaction = functions.storage
  .bucket()
  .object()
  .onDelete((object, context) => {
    console.log(STORAGE_FUNCTION_DELETED_LOG);
    console.log("Object", JSON.stringify(object));
    return true;
  });

exports.storageFinalizeReaction = functions.storage
  .bucket()
  .object()
  .onFinalize((object, context) => {
    console.log(STORAGE_FUNCTION_FINALIZED_LOG);
    console.log("Object", JSON.stringify(object));
    return true;
  });

exports.storageMetadataReaction = functions.storage
  .bucket()
  .object()
  .onMetadataUpdate((object, context) => {
    console.log(STORAGE_FUNCTION_METADATA_LOG);
    console.log("Object", JSON.stringify(object));
    return true;
  });

exports.onCall = functions.https.onCall((data) => {
  console.log("data", JSON.stringify(data));
  return data;
});

exports.storageBucketArchiveReaction = functions.storage
  .bucket("test-bucket")
  .object()
  .onArchive((object, context) => {
    console.log(STORAGE_BUCKET_FUNCTION_ARCHIVED_LOG);
    console.log("Object", JSON.stringify(object));
    return true;
  });

exports.storageBucketDeleteReaction = functions.storage
  .bucket("test-bucket")
  .object()
  .onDelete((object, context) => {
    console.log(STORAGE_BUCKET_FUNCTION_DELETED_LOG);
    console.log("Object", JSON.stringify(object));
    return true;
  });

exports.storageBucketFinalizeReaction = functions.storage
  .bucket("test-bucket")
  .object()
  .onFinalize((object, context) => {
    console.log(STORAGE_BUCKET_FUNCTION_FINALIZED_LOG);
    console.log("Object", JSON.stringify(object));
    return true;
  });

exports.storageBucketMetadataReaction = functions.storage
  .bucket("test-bucket")
  .object()
  .onMetadataUpdate((object, context) => {
    console.log(STORAGE_BUCKET_FUNCTION_METADATA_LOG);
    console.log("Object", JSON.stringify(object));
    return true;
  });
