"use strict";

var javaEmulators = require("./javaEmulators");

const name = "database";

function _stop() {
  return javaEmulators.stop(name);
}

function _start() {
  return javaEmulators.start(name);
}

module.exports = {
  start: _start,
  stop: _stop,
};
