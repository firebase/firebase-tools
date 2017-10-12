'use strict';

var Command = require('../lib/command');
var firestoreIndexes = require('../lib/firestore/indexes.js');
var requireAccess = require('../lib/requireAccess');
var scopes = require('../lib/scopes');

var _prettyPrint = function(indexes) {
  indexes.forEach(function(index) {
    process.stdout.write(firestoreIndexes.toPrettyString(index) + '\n');
  });
};

var _jsonPrint = function(indexes) {
  var jsonObj = {
    indexes: []
  };

  indexes.forEach(function(index) {
    jsonObj.indexes.push({
      collectionId: index.collectionId,
      fields: index.fields
    });
  });

  process.stdout.write(JSON.stringify(jsonObj, undefined, 2));
};

module.exports = new Command('firestore:indexes')
  .description('List indexes on a Cloud Firestore project.')
  .option('--pretty', 'Pretty print. When not specified the indexes are printed in the same format '
      + 'as the input deployment specification file.')
  .before(requireAccess, [scopes.CLOUD_PLATFORM])
  .action(function(options) {
    return firestoreIndexes.list(options.project)
      .then(function(indexes) {
        if (options.pretty) {
          _prettyPrint(indexes);
        } else {
          _jsonPrint(indexes);
        }
      });
  });
