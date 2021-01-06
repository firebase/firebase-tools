"use strict";

var fs = require("fs");
var spawn = require("cross-spawn");
var { FirebaseError } = require("./error");
var clc = require("cli-color");

module.exports = function(filename) {
  var ruleSrc = fs.readFileSync(filename, "utf8");

  // Use 'npx' to spawn 'firebase-bolt' so that it can be picked up
  // from either a global install or from local ./node_modules/
  var result = spawn.sync("npx", ["--no-install", "firebase-bolt"], {
    input: ruleSrc,
    timeout: 10000,
    encoding: "utf-8",
  });

  if (result.error && result.error.code === "ENOENT") {
    throw new FirebaseError("Bolt not installed, run " + clc.bold("npm install -g firebase-bolt"), {
      exit: 1,
    });
  } else if (result.error) {
    throw new FirebaseError("Unexpected error parsing Bolt rules file", {
      exit: 2,
    });
  } else if (result.status > 0) {
    throw new FirebaseError(result.stderr, { exit: 1 });
  }

  return result.stdout;
};
