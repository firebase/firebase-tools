const functions = require("firebase-functions");
const { onRequest } = require("firebase-functions/v2/https");

exports.hellov1 = functions.https.onRequest((request, response) => {
  response.send("Hello from Firebase!");
});

exports.hellov2 = onRequest((request, response) => {
  response.send("Hello from Firebase!");
});
