var functions = require("firebase-functions");
var admin = require("firebase-admin");
admin.initializeApp(functions.config().firebase);

exports.dbAction = functions.database.ref("/input/{uuid}").onCreate(function(snap, context) {
  console.log("Received snapshot:", snap);
  return snap.ref.root.child("output/" + context.params.uuid).set(snap.val());
});

exports.nested = {
  dbAction: functions.database.ref("/inputNested/{uuid}").onCreate(function(snap, context) {
    console.log("Received snap:", snap);
    return snap.ref.root.child("output/" + context.params.uuid).set(snap.val());
  }),
};

exports.httpsAction = functions.https.onRequest(function(req, res) {
  res.send(req.body);
});

exports.pubsubAction = functions.pubsub.topic("topic1").onPublish(function(message) {
  console.log("Received message:", message);
  var uuid = message.json;
  return admin
    .database()
    .ref("output/" + uuid)
    .set(uuid);
});

exports.gcsAction = functions.storage.object().onFinalize(function(object) {
  console.log("Received object:", object);
  var uuid = object.name;
  return admin
    .database()
    .ref("output/" + uuid)
    .set(uuid);
});

exports.pubsubScheduleAction = functions.pubsub
  .schedule("every 10 minutes")
  .onRun(function(context) {
    console.log("Scheduled function triggered:", context);
    return true;
  });
