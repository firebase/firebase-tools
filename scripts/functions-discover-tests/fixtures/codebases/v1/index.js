const functions = require("firebase-functions");

exports.hellov1 = functions.https.onRequest((request, response) => {
  response.send("Hello from Firebase!");
});
