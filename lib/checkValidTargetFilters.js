"use strict";

var _ = require("lodash");

var FirebaseError = require("./error");

module.exports = function(options) {
  function numFilters(targetTypes) {
    return _.filter(options.only, function(opt) {
      var optChunks = opt.split(":");
      return _.includes(targetTypes, optChunks[0]) && optChunks.length > 1;
    }).length;
  }
  function targetContainsFilter(targetTypes) {
    return numFilters(targetTypes) > 1;
  }
  function targetDoesNotContainFilter(targetTypes) {
    return numFilters(targetTypes) === 0;
  }

  return new Promise(function(resolve, reject) {
    if (!options.only) {
      return resolve();
    }
    if (options.except) {
      return reject(
        new FirebaseError("Cannot specify both --only and --except", {
          exit: 1,
        })
      );
    }
    if (targetContainsFilter(["database", "storage", "hosting"])) {
      return reject(
        new FirebaseError(
          "Filters specified with colons (e.g. --only functions:func1,functions:func2) are only supported for functions",
          { exit: 1 }
        )
      );
    }
    if (targetContainsFilter(["functions"]) && targetDoesNotContainFilter(["functions"])) {
      return reject(
        new FirebaseError(
          'Cannot specify "--only functions" and "--only functions:<filter>" at the same time',
          { exit: 1 }
        )
      );
    }
    return resolve();
  });
};
