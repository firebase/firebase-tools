const functions = require("firebase-functions");
const { onRequest } = require("firebase-functions/v2/https");
const { msg } = require("@firebase/a-test-pkg");

exports.hellov1 = functions.https.onRequest((request, response) => {
  response.send(msg);
});

exports.hellov2 = onRequest((request, response) => {
  response.send(msg);
});
