"use strict";

const javaEmulators = require("./javaEmulators");

const name = "database";

function _stop() {
  return javaEmulators.stop(name);
}

function _start(options) {
  let databaseOptions = {};
  if (options.databaseHost) {
    databaseOptions.host = options.databaseHost;
  }
  if (options.databasePort) {
    databaseOptions.port = options.databasePort;
  }
  return javaEmulators.start(name, databaseOptions);
}

module.exports = {
  start: _start,
  stop: _stop,
};
