const admin = require("firebase-admin");
const functionsV2 = require("firebase-functions/v2");

/*
 * Log snippets that the driver program above checks for. Be sure to update
 * ../test.js if you plan on changing these.
 */
const PUBSUB_FUNCTION_LOG = "========== PUBSUB V2 FUNCTION ==========";
const STORAGE_FUNCTION_ARCHIVED_LOG = "========== STORAGE V2 FUNCTION ARCHIVED ==========";
const STORAGE_FUNCTION_DELETED_LOG = "========== STORAGE V2 FUNCTION DELETED ==========";
const STORAGE_FUNCTION_FINALIZED_LOG = "========== STORAGE V2 FUNCTION FINALIZED ==========";
const STORAGE_FUNCTION_METADATA_LOG = "========== STORAGE V2 FUNCTION METADATA ==========";
const STORAGE_BUCKET_FUNCTION_ARCHIVED_LOG =
  "========== STORAGE BUCKET V2 FUNCTION ARCHIVED ==========";
const STORAGE_BUCKET_FUNCTION_DELETED_LOG =
  "========== STORAGE BUCKET V2 FUNCTION DELETED ==========";
const STORAGE_BUCKET_FUNCTION_FINALIZED_LOG =
  "========== STORAGE BUCKET V2 FUNCTION FINALIZED ==========";
const STORAGE_BUCKET_FUNCTION_METADATA_LOG =
  "========== STORAGE BUCKET V2 FUNCTION METADATA ==========";
const AUTH_BLOCKING_CREATE_V2_LOG =
  "========== AUTH BLOCKING CREATE V2 FUNCTION METADATA ==========";
const AUTH_BLOCKING_SIGN_IN_V2_LOG =
  "========== AUTH BLOCKING SIGN IN V2 FUNCTION METADATA ==========";
const RTDB_LOG = "========== RTDB V2 FUNCTION ==========";
const FIRESTORE_LOG = "========== FIRESTORE V2 FUNCTION ==========";

const PUBSUB_TOPIC = "test-topic";

const START_DOCUMENT_NAME = "test/start";
const END_DOCUMENT_NAME = "test/done";

admin.initializeApp();

exports.httpsv2reaction = functionsV2.https.onRequest((req, res) => {
  res.send("httpsv2reaction");
});

exports.pubsubv2reaction = functionsV2.pubsub.onMessagePublished(PUBSUB_TOPIC, (cloudevent) => {
  console.log(PUBSUB_FUNCTION_LOG);
  console.log("Message", JSON.stringify(cloudevent.data.message.json));
  console.log("Attributes", JSON.stringify(cloudevent.data.message.attributes));
  return true;
});

exports.storagev2archivedreaction = functionsV2.storage.onObjectArchived((cloudevent) => {
  console.log(STORAGE_FUNCTION_ARCHIVED_LOG);
  console.log("Object", JSON.stringify(cloudevent.data));
  return true;
});

exports.storagev2deletedreaction = functionsV2.storage.onObjectDeleted((cloudevent) => {
  console.log(STORAGE_FUNCTION_DELETED_LOG);
  console.log("Object", JSON.stringify(cloudevent.data));
  return true;
});

exports.storagev2finalizedreaction = functionsV2.storage.onObjectFinalized((cloudevent) => {
  console.log(STORAGE_FUNCTION_FINALIZED_LOG);
  console.log("Object", JSON.stringify(cloudevent.data));
  return true;
});

exports.storagev2metadatareaction = functionsV2.storage.onObjectMetadataUpdated((cloudevent) => {
  console.log(STORAGE_FUNCTION_METADATA_LOG);
  console.log("Object", JSON.stringify(cloudevent.data));
  return true;
});

exports.storagebucketv2archivedreaction = functionsV2.storage.onObjectArchived(
  "test-bucket",
  (cloudevent) => {
    console.log(STORAGE_BUCKET_FUNCTION_ARCHIVED_LOG);
    console.log("Object", JSON.stringify(cloudevent.data));
    return true;
  },
);

exports.storagebucketv2deletedreaction = functionsV2.storage.onObjectDeleted(
  "test-bucket",
  (cloudevent) => {
    console.log(STORAGE_BUCKET_FUNCTION_DELETED_LOG);
    console.log("Object", JSON.stringify(cloudevent.data));
    return true;
  },
);

exports.storagebucketv2finalizedreaction = functionsV2.storage.onObjectFinalized(
  "test-bucket",
  (cloudevent) => {
    console.log(STORAGE_BUCKET_FUNCTION_FINALIZED_LOG);
    console.log("Object", JSON.stringify(cloudevent.data));
    return true;
  },
);

exports.storagebucketv2metadatareaction = functionsV2.storage.onObjectMetadataUpdated(
  "test-bucket",
  (cloudevent) => {
    console.log(STORAGE_BUCKET_FUNCTION_METADATA_LOG);
    console.log("Object", JSON.stringify(cloudevent.data));
    return true;
  },
);

exports.oncallv2 = functionsV2.https.onCall((req) => {
  console.log("data", JSON.stringify(req.data));
  return req.data;
});

exports.authblockingcreatereaction = functionsV2.identity.beforeUserCreated((event) => {
  console.log(AUTH_BLOCKING_CREATE_V2_LOG);
  return;
});

exports.authblockingsigninreaction = functionsV2.identity.beforeUserSignedIn((event) => {
  console.log(AUTH_BLOCKING_SIGN_IN_V2_LOG);
  return;
});

exports.onreqv2a = functionsV2.https.onRequest((req, res) => {
  res.send("onreqv2a");
});

exports.onreqv2b = functionsV2.https.onRequest((req, res) => {
  res.send("onreqv2b");
});

exports.onreqv2timeout = functionsV2.https.onRequest({ timeoutSeconds: 1 }, async (req, res) => {
  return new Promise((resolve) => {
    setTimeout(() => {
      res.send("onreqv2timeout");
      resolve();
    }, 3_000);
  });
});

exports.rtdbv2reaction = functionsV2.database.onValueWritten(START_DOCUMENT_NAME, (event) => {
  console.log(RTDB_LOG);
  return;
});

exports.firestorev2reaction = functionsV2.firestore.onDocumentWritten(
  START_DOCUMENT_NAME,
  async (event) => {
    console.log(FIRESTORE_LOG);
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
  },
);
