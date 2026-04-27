import 'package:firebase_functions/firebase_functions.dart';

void main(List<String> args) {
  fireUp(args, (firebase) {
    // https://firebase.google.com/docs/functions/http-events
    firebase.https.onRequest(
      name: 'helloWorld',
      options: const HttpsOptions(
        cors: Cors(['*']),
        // Set maxInstances to control costs during unexpected traffic spikes.
        // https://firebase.google.com/docs/functions/manage-functions#min-max-instances
        maxInstances: Instances(10),
      ),
      (request) async => Response(200, body: 'Hello from Dart Functions!'),
    );
  });
}
