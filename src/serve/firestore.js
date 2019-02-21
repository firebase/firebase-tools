"use strict";

const javaEmulators = require("./javaEmulators");

const name = "firestore";

function _stop() {
  return javaEmulators.stop(name);
}

function _start(options) {
  let firestoreOptions = {};
  if (options.firestoreHost) {
    firestoreOptions.host = options.firestoreHost;
  }
  if (options.firestorePort) {
    firestoreOptions.port = options.firestorePort;
  }
  return javaEmulators.start(name, firestoreOptions);
}

module.exports = {
  start: _start,
  stop: _stop,
};
