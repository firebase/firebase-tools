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

const PUBSUB_TOPIC = "test-topic";

admin.initializeApp();

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
  }
);

exports.storagebucketv2deletedreaction = functionsV2.storage.onObjectDeleted(
  "test-bucket",
  (cloudevent) => {
    console.log(STORAGE_BUCKET_FUNCTION_DELETED_LOG);
    console.log("Object", JSON.stringify(cloudevent.data));
    return true;
  }
);

exports.storagebucketv2finalizedreaction = functionsV2.storage.onObjectFinalized(
  "test-bucket",
  (cloudevent) => {
    console.log(STORAGE_BUCKET_FUNCTION_FINALIZED_LOG);
    console.log("Object", JSON.stringify(cloudevent.data));
    return true;
  }
);

exports.storagebucketv2metadatareaction = functionsV2.storage.onObjectMetadataUpdated(
  "test-bucket",
  (cloudevent) => {
    console.log(STORAGE_BUCKET_FUNCTION_METADATA_LOG);
    console.log("Object", JSON.stringify(cloudevent.data));
    return true;
  }
);

exports.oncallv2 = functionsV2.https.onCall((req) => {
  console.log("data", JSON.stringify(req.data));
  return req.data;
});
