var functions = require("firebase-functions");
var admin = require("firebase-admin");
admin.initializeApp(functions.config().firebase);

exports.dbAction = functions.database.ref("/input/{uuid}").onWrite(function(event) {
  console.log("Received event:", event);
  return event.data.ref.root.child("output/" + event.params.uuid).set(event.data.val());
});

exports.nested = {
  dbAction: functions.database.ref("/inputNested/{uuid}").onWrite(function(event) {
    console.log("Received event:", event);
    return event.data.ref.root.child("output/" + event.params.uuid).set(event.data.val());
  }),
};

exports.httpsAction = functions.https.onRequest(function(req, res) {
  res.send(req.body);
});

exports.pubsubAction = functions.pubsub.topic("topic1").onPublish(function(event) {
  console.log("Received event:", event);
  var uuid = event.data.json;
  return admin
    .database()
    .ref("output/" + uuid)
    .set(uuid);
});

exports.gcsAction = functions.storage.object().onChange(function(event) {
  console.log("Received event:", event);
  var uuid = event.data.name;
  return admin
    .database()
    .ref("output/" + uuid)
    .set(uuid);
});

exports.pubsubScheduleAction = functions.pubsub.schedule("every 10 minutes").onPublish(function(event) {
  console.log("Received scheduled event:", event);
  return true;
});
