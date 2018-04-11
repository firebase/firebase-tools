"use strict";

var Command = require("../lib/command");
var firestoreIndexes = require("../lib/firestore/indexes.js");
var requireAccess = require("../lib/requireAccess");
var scopes = require("../lib/scopes");
var logger = require("../lib/logger");
var _ = require("lodash");

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

module.exports = new Command("firestore:indexes")
  .description("List indexes in your project's Cloud Firestore database.")
  .option(
    "--pretty",
    "Pretty print. When not specified the indexes are printed in the " +
      "JSON specification format."
  )
  .before(requireAccess, [scopes.CLOUD_PLATFORM])
  .action(function(options) {
    return firestoreIndexes.list(options.project).then(function(indexes) {
      var jsonSpec = _makeJsonSpec(indexes);

      if (options.pretty) {
        _prettyPrint(indexes);
      } else {
        logger.info(JSON.stringify(jsonSpec, undefined, 2));
      }

      return jsonSpec;
    });
  });
