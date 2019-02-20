"use strict";

const javaEmulators = require("./javaEmulators");

const name = "firestore";

function _stop() {
  return javaEmulators.stop(name);
}

function _start(options) {
  let firestoreOptions = {};
  if (options.firestoreHost) {
    options.host = options.firestoreHost;
  }
  if (options.firestorePort) {
    options.port = options.firestorePort;
  }
  return javaEmulators.start(name, options);
}

module.exports = {
  start: _start,
  stop: _stop,
};
