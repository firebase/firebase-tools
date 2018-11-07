"use strict";

var FirebaseError = require("./error");

module.exports = function(options) {
  if (options.config) {
    return Promise.resolve();
  }
  return Promise.reject(
    options.configError ||
      new FirebaseError("Not in a Firebase project directory (could not locate firebase.json)", {
        exit: 1,
      })
  );
};
