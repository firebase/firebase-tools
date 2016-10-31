var functions = require('firebase-functions');

exports.dbAction = functions.database().path('/input/{uuid}').onWrite(function(event) {
  return event.data.ref.root.child('output/' + event.params.uuid).set(event.data.val());
});

exports.nested = {
  dbAction: functions.database().path('/inputNested/{uuid}').onWrite(function(event) {
    return event.data.ref.root.child('output/' + event.params.uuid).set(event.data.val());
  })
};

exports.httpsAction = functions.cloud.https().onRequest(function(req, res) {
  res.send(req.body);
});

exports.pubsubAction = functions.cloud.pubsub('topic1').onPublish(function(event) {
  var uuid = event.data.json;
  var app = functions.app;
  return app.database().ref('output/' + uuid).set(uuid);
});

exports.gcsAction = functions.cloud.storage('functions-integration-test.appspot.com')
  .onChange(function(event) {
    var uuid = event.data.data.name;
    var app = functions.app;
    return app.database().ref('output/' + uuid).set(uuid);
  });