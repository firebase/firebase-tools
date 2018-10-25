"use strict";

var logError = require("./logError");
var FirebaseError = require("./error");

module.exports = function(client, error) {
  if (error.name !== "FirebaseError") {
    error = new FirebaseError("An unexpected error has occurred.", {
      original: error,
      exit: 2,
    });
  }

  logError(error);
  process.exitCode = error.exit || 2;
  setTimeout(function() {
    process.exit();
  }, 250);
};
