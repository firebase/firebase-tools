'use strict';

var Command = require('../lib/command');
var firestoreIndexes = require('../lib/firestore/indexes.js');
var requireAccess = require('../lib/requireAccess');
var scopes = require('../lib/scopes');
var logger = require('../lib/logger');

var _prettyPrint = function(indexes) {
  indexes.forEach(function(index) {
    logger.info(firestoreIndexes.toPrettyString(index));
  });
};

var _makeJsonSpec = function(indexes) {
  var jsonSpec = {
    indexes: []
  };

  indexes.forEach(function(index) {
    jsonSpec.indexes.push({
      collectionId: index.collectionId,
      fields: index.fields
    });
  });

  return jsonSpec;
};

module.exports = new Command('firestore:indexes')
  .description('List indexes on a Cloud Firestore project.')
  .option('--pretty', 'Pretty print. When not specified the indexes are printed in the same format '
      + 'as the input deployment specification file.')
  .before(requireAccess, [scopes.CLOUD_PLATFORM])
  .action(function(options) {
    return firestoreIndexes.list(options.project)
      .then(function(indexes) {
        var jsonSpec = _makeJsonSpec(indexes);

        if (options.pretty) {
          _prettyPrint(indexes);
        } else {
          logger.info(JSON.stringify(jsonSpec, undefined, 2));
        }

        return jsonSpec;
      });
  });
