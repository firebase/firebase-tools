var functions = require("firebase-functions");

exports.httpsAction = functions.https.onRequest(function (req, res) {
  res.send(json.stringify(req.body));
});
