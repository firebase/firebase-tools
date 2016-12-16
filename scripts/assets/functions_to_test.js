var functions = require('firebase-functions');

exports.dbAction = functions.database().path('/input/{uuid}').onWrite(function(event) {
  console.log('Received event:', event);
  return event.data.ref.root.child('output/' + event.params.uuid).set(event.data.val());
});

exports.nested = {
  dbAction: functions.database().path('/inputNested/{uuid}').onWrite(function(event) {
  console.log('Received event:', event);
    return event.data.ref.root.child('output/' + event.params.uuid).set(event.data.val());
  })
};

exports.httpsAction = functions.https().onRequest(function(req, res) {
  res.send(req.body);
});

exports.pubsubAction = functions.pubsub('topic1').onPublish(function(event) {
  console.log('Received event:', event);
  var uuid = event.data.json;
  var app = functions.app;
  return app.database().ref('output/' + uuid).set(uuid);
});

exports.gcsAction = functions.storage().onChange(function(event) {
  console.log('Received event:', event);
  var uuid = event.data.name;
  var app = functions.app;
  return app.database().ref('output/' + uuid).set(uuid);
});
