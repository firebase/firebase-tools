const admin = require("firebase-admin");
const functions = require("firebase-functions");
const firebase = require("firebase");
let functionsV2;
try {
  functionsV2 = require("firebase-functions/v2");
} catch {
  // TODO: firebase-functions/lib path is unsupported, but this is the only way to access the v2 namespace in Node 10.
  // Remove this ugly hack once we cut support for Node 10.
  functionsV2 = require("firebase-functions/lib/v2");
}
const { PubSub } = require("@google-cloud/pubsub");

/*
 * Log snippets that the driver program above checks for. Be sure to update
 * ../test.js if you plan on changing these.
 */
/* Functions V1 */
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
/* Functions V2 */
const PUBSUB_FUNCTION_V2_LOG = "========== PUBSUB V2 FUNCTION ==========";
const STORAGE_FUNCTION_V2_ARCHIVED_LOG = "========== STORAGE V2 FUNCTION ARCHIVED ==========";
const STORAGE_FUNCTION_V2_DELETED_LOG = "========== STORAGE V2 FUNCTION DELETED ==========";
const STORAGE_FUNCTION_V2_FINALIZED_LOG = "========== STORAGE V2 FUNCTION FINALIZED ==========";
const STORAGE_FUNCTION_V2_METADATA_LOG = "========== STORAGE V2 FUNCTION METADATA ==========";
const STORAGE_BUCKET_FUNCTION_V2_ARCHIVED_LOG =
  "========== STORAGE BUCKET V2 FUNCTION ARCHIVED ==========";
const STORAGE_BUCKET_FUNCTION_V2_DELETED_LOG =
  "========== STORAGE BUCKET V2 FUNCTION DELETED ==========";
const STORAGE_BUCKET_FUNCTION_V2_FINALIZED_LOG =
  "========== STORAGE BUCKET V2 FUNCTION FINALIZED ==========";
const STORAGE_BUCKET_FUNCTION_V2_METADATA_LOG =
  "========== STORAGE BUCKET V2 FUNCTION METADATA ==========";

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

const STORAGE_FILE_NAME = "test-file.txt";

const pubsub = new PubSub();
admin.initializeApp();

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

exports.writeToDefaultStorage = functions.https.onRequest(async (req, res) => {
  await admin.storage().bucket().file(STORAGE_FILE_NAME).save("hello world!");
  console.log("Wrote to default Storage bucket");
  res.json({ created: "ok" });
});

exports.abhisunTest = functions.https.onRequest(async (req, res) => {
  await firebase
  .storage()
  .ref("test-bucket/image_put.png")
  .putString("Testing string", "base64", JSON.parse({
    contentType: "text/plain",
  }))
  console.log("Wrote to default Storage bucket, abhisun test");
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

exports.pubsubv2reaction = functionsV2.pubsub.onMessagePublished(PUBSUB_TOPIC, (cloudevent) => {
  console.log(PUBSUB_FUNCTION_V2_LOG);
  console.log("Message", JSON.stringify(cloudevent.data.message.json));
  console.log("Attributes", JSON.stringify(cloudevent.data.message.attributes));
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

exports.storagev2archivedreaction = functionsV2.storage.onObjectArchived((cloudevent) => {
  console.log(STORAGE_FUNCTION_V2_ARCHIVED_LOG);
  console.log("Object", JSON.stringify(cloudevent.data));
  return true;
});

exports.storagev2deletedreaction = functionsV2.storage.onObjectDeleted((cloudevent) => {
  console.log(STORAGE_FUNCTION_V2_DELETED_LOG);
  console.log("Object", JSON.stringify(cloudevent.data));
  return true;
});

exports.storagev2finalizedreaction = functionsV2.storage.onObjectFinalized((cloudevent) => {
  console.log(STORAGE_FUNCTION_V2_FINALIZED_LOG);
  console.log("Object", JSON.stringify(cloudevent.data));
  return true;
});

exports.storagev2metadatareaction = functionsV2.storage.onObjectMetadataUpdated((cloudevent) => {
  console.log(STORAGE_FUNCTION_V2_METADATA_LOG);
  console.log("Object", JSON.stringify(cloudevent.data));
  return true;
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

exports.storagebucketv2archivedreaction = functionsV2.storage.onObjectArchived(
  "test-bucket",
  (cloudevent) => {
    console.log(STORAGE_BUCKET_FUNCTION_V2_ARCHIVED_LOG);
    console.log("Object", JSON.stringify(cloudevent.data));
    return true;
  }
);

exports.storagebucketv2deletedreaction = functionsV2.storage.onObjectDeleted(
  "test-bucket",
  (cloudevent) => {
    console.log(STORAGE_BUCKET_FUNCTION_V2_DELETED_LOG);
    console.log("Object", JSON.stringify(cloudevent.data));
    return true;
  }
);

exports.storagebucketv2finalizedreaction = functionsV2.storage.onObjectFinalized(
  "test-bucket",
  (cloudevent) => {
    console.log(STORAGE_BUCKET_FUNCTION_V2_FINALIZED_LOG);
    console.log("Object", JSON.stringify(cloudevent.data));
    return true;
  }
);

exports.storagebucketv2metadatareaction = functionsV2.storage.onObjectMetadataUpdated(
  "test-bucket",
  (cloudevent) => {
    console.log(STORAGE_BUCKET_FUNCTION_V2_METADATA_LOG);
    console.log("Object", JSON.stringify(cloudevent.data));
    return true;
  }
);

exports.oncallv2 = functionsV2.https.onCall((req) => {
  console.log("data", JSON.stringify(req.data));
  return req.data;
});
