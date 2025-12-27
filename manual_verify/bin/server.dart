import 'dart:io';
void main() async {
  final port = int.parse(Platform.environment['PORT'] ?? '8080');
  final server = await HttpServer.bind('0.0.0.0', port);
  print('Server listening on port $port');
  await for (final request in server) {
    request.response..statusCode = HttpStatus.ok..write('Hello!')..close();
  }
}
