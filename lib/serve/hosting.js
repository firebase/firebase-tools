"use strict";

var clc = require("cli-color");
var FirebaseError = require("../error");

var superstatic = require("superstatic").server;
var utils = require("../utils");
var detectProjectRoot = require("../detectProjectRoot");
var implicitInit = require("../hosting/implicitInit");
var initMiddleware = require("../hosting/initMiddleware");
var functionsProxy = require("../hosting/functionsProxy");
var normalizedHostingConfigs = require("../hosting/normalizedHostingConfigs");

var MAX_PORT_ATTEMPTS = 10;
var _attempts = 0;

function _startServer(options, config, port, init) {
  var server = superstatic({
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
    },
  }).listen(function() {
    var siteName = config.target || config.site;
    var label = siteName ? "hosting[" + siteName + "]" : "hosting";

    if (config.public && config.public !== ".") {
      utils.logLabeledBullet(label, "Serving hosting files from: " + clc.bold(config.public));
    }
    utils.logLabeledSuccess(
      label,
      "Local server: " + clc.underline(clc.bold("http://" + options.host + ":" + port))
    );
  });

  server.on("error", function(err) {
    if (err.code === "EADDRINUSE") {
      var message = "Port " + options.port + " is not available.";
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
  return Promise.resolve();
}

function _start(options) {
  return implicitInit(options).then(function(init) {
    var configs = normalizedHostingConfigs(options);

    for (var i = 0; i < configs.length; i++) {
      // skip over the functions emulator ports to avoid breaking changes
      var port = i === 0 ? options.port : options.port + 4 + i;
      _startServer(options, configs[i], port, init);
    }
  });
}

module.exports = {
  start: _start,
  stop: _stop,
};
