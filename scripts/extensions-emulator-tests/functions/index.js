const admin = require("firebase-admin");
const functions = require("firebase-functions");

admin.initializeApp();

const STORAGE_FILE_NAME = "test.png";

exports.writeToDefaultStorage = functions.https.onRequest(async (req, res) => {
  await admin.storage().bucket().upload(STORAGE_FILE_NAME);
  console.log("Wrote to default Storage bucket");
  res.json({ created: "ok" });
});
