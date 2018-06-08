"use strict";

var Command = require("../lib/command");
var requireAccess = require("../lib/requireAccess");
var scopes = require("../lib/scopes");
// var logger = require("../lib/logger");
// var _ = require("lodash");
var PrepareRules = require("../lib/deploy/firestore/prepare.js");

/*
var _prettyPrint = function(indexes) {
  indexes.forEach(function(index) {
    logger.info(firestoreIndexes.toPrettyString(index));
  });
};

var _makeJsonSpec = function(indexes) {
  return {
    indexes: indexes.map(function(index) {
      return _.pick(index, ["collectionId", "fields"]);
    }),
  };
};
*/

module.exports = new Command("firestore:rules:check")
  .description("Checks if your firestore rules can compile.")
  .before(requireAccess, [scopes.CLOUD_PLATFORM])
  .action(function(options) {
    return PrepareRules({ firestoreRules: true, firestoreIndexes: false }, options);
    /*
    return firestoreIndexes.list(options.project).then(function(indexes) {
      var jsonSpec = _makeJsonSpec(indexes);

      if (options.pretty) {
        _prettyPrint(indexes);
      } else {
        logger.info(JSON.stringify(jsonSpec, undefined, 2));
      }

      return jsonSpec;
    });
    */
  });
