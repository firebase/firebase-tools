"use strict";

const javaEmulators = require("./javaEmulators");

const name = "database";

function _stop() {
  return javaEmulators.stop(name);
}

function _start(options) {
  let databaseOptions = {};
  if (options.databaseHost) {
    options.host = options.databaseHost;
  }
  if (options.databasePort) {
    options.port = options.databasePort;
  }
  return javaEmulators.start(name, options);
}

module.exports = {
  start: _start,
  stop: _stop,
};
