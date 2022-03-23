#!/usr/bin/env python3
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import logging
import os
import threading

testRegion = 'us-central1'
testFunctionName = 'helloFunction'


class AdminHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        path = self.path
        logging.info(path)
        if (path == '/__/quitquitquit'):
            os._exit(0)
        elif (path == '/__/functions.yaml'):
            self.send_response(200)
            self.send_header('Content-type', 'text/yaml')
            self.end_headers()
            # Should source from functions.yaml file or generated
            self.wfile.write(b"""specVersion: v1alpha1
endpoints:
  hellofunction:
    entryPoint: hellofunction
    httpsTrigger: {}
  foofunction:
    entryPoint: foofunction
    httpsTrigger: {}
""")


class FunctionsHandler(BaseHTTPRequestHandler):
    # TODO not just POST requests
    def do_POST(self):
        path = self.path
        logging.info(path)
        if (path.startsWith('/{}/{}'.format(os.environ['GCLOUD_PROJECT'], testRegion))):
            self.send_response(200)
            self.send_header('Content-type', 'application/text')
            self.end_headers()
            response_data = "Hello World!"
            self.wfile.write(response_data.encode('utf-8'))
            return
        else:
            self.send_response(404)
            self.end_headers()
            self.wfile.close()
            return


def runHttpServer(server_class=ThreadingHTTPServer, handler_class=FunctionsHandler, port=8080):
    logging.basicConfig(level=logging.INFO)
    server_address = ('localhost', port)
    httpd = server_class(server_address, handler_class)
    logging.info('Starting http handler on port {}'.format(port))
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    httpd.server_close()
    logging.info('Stopping http handler on port {}'.format(port))


def startLocalExample():
    user = threading.Thread(target=lambda: runHttpServer(
        handler_class=FunctionsHandler, port=int(os.environ['PORT'])))
    user.start()
    if 'ADMIN_PORT' in os.environ:
        admin = threading.Thread(target=lambda: runHttpServer(
            handler_class=AdminHandler, port=int(os.environ['ADMIN_PORT'])))
        admin.start()


startLocalExample()
