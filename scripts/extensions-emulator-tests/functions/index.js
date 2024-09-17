const admin = require("firebase-admin");
const functions = require("firebase-functions");
const { onCustomEventPublished } = require("firebase-functions/v2/eventarc");

admin.initializeApp();

const STORAGE_FILE_NAME = "test.png";

exports.writeToDefaultStorage = functions.https.onRequest(async (req, res) => {
  await admin.storage().bucket().upload(STORAGE_FILE_NAME);
  console.log("Wrote to default Storage bucket");
  res.json({ created: "ok" });
});

exports.eventhandler = onCustomEventPublished(
  {
    eventType: "firebase.extensions.storage-resize-images.v1.complete",
    channel: "locations/us-west1/channels/firebase",
    region: "us-west1",
  },
  (event) => {
    admin
      .firestore()
      .collection("resizedImages")
      .doc(STORAGE_FILE_NAME)
      .set({ eventHandlerFired: true });
  },
);
