"use strict";

const clc = require("cli-color");
let { FirebaseError } = require("../error");

const superstatic = require("superstatic").server;
const utils = require("../utils");
const detectProjectRoot = require("../detectProjectRoot");
const implicitInit = require("../hosting/implicitInit");
const initMiddleware = require("../hosting/initMiddleware");
const functionsProxy = require("../hosting/functionsProxy").default;
const cloudRunProxy = require("../hosting/cloudRunProxy").default;
const normalizedHostingConfigs = require("../hosting/normalizedHostingConfigs");

const MAX_PORT_ATTEMPTS = 10;
let _attempts = 0;
let server: any;

function _startServer(options: any, config: any, port: any, init: any) {
  server = superstatic({
    debug: true,
    port: port,
    host: options.host,
    config: config,
    cwd: detectProjectRoot(options.cwd),
    stack: "strict",
    before: {
      files: initMiddleware(init),
    },
    rewriters: {
      function: functionsProxy(options),
      run: cloudRunProxy(options),
    },
  }).listen(function() {
    const siteName = config.target || config.site;
    const label = siteName ? "hosting[" + siteName + "]" : "hosting";

    if (config.public && config.public !== ".") {
      utils.logLabeledBullet(label, "Serving hosting files from: " + clc.bold(config.public));
    }
    utils.logLabeledSuccess(
      label,
      "Local server: " + clc.underline(clc.bold("http://" + options.host + ":" + port))
    );
  });

  server.on("error", function(err: any) {
    if (err.code === "EADDRINUSE") {
      const message = "Port " + options.port + " is not available.";
      if (_attempts < MAX_PORT_ATTEMPTS) {
        utils.logWarning(clc.yellow("hosting: ") + message + " Trying another port...");
        // Another project that's running takes up to 4 ports: 1 hosting port and 3 functions ports
        _attempts++;
        _startServer(options, config, port + 5, init);
      } else {
        utils.logWarning(message);
        throw new FirebaseError("Could not find an open port for hosting development server.", {
          exit: 1,
        });
      }
    } else {
      throw new FirebaseError(
        "An error occurred while starting the hosting development server:\n\n" + err.toString(),
        { exit: 1 }
      );
    }
  });
}

function _stop() {
  if (server) {
    server.close();
  }
  return Promise.resolve();
}

function _start(options: any) {
  return implicitInit(options).then(function(init: any) {
    const configs = normalizedHostingConfigs(options);

    for (let i = 0; i < configs.length; i++) {
      // skip over the functions emulator ports to avoid breaking changes
      const port = i === 0 ? options.port : options.port + 4 + i;
      _startServer(options, configs[i], port, init);
    }
  });
}

function _connect() {
  return Promise.resolve();
}

module.exports = {
  start: _start,
  connect: _connect,
  stop: _stop,
};
