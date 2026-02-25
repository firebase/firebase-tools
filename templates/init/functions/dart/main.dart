import 'package:firebase_functions/firebase_functions.dart';

void main(List<String> args) {
  fireUp(args, (firebase) {

    firebase.https.onRequest(
      name: 'helloWorld',
      options: const HttpsOptions(cors: Cors(['*'])),
      (request) async {
        return Response(200, body: 'Hello from Dart Functions!');
      });
  });
}
