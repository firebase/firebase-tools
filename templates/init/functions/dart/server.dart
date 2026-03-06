import 'package:firebase_functions/firebase_functions.dart';

void main(List<String> args) {
  fireUp(args, (firebase) {
    // Set maxInstances to control costs during unexpected traffic spikes.
    firebase.https.onRequest(
      name: 'helloWorld',
      options: const HttpsOptions(
        cors: Cors(['*']),
        maxInstances: Instances(10),
      ),
      (request) async => Response(200, body: 'Hello from Dart Functions!'),
    );
  });
}
