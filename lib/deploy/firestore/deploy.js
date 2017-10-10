'use strict';

var _ = require('lodash');
var chalk = require('chalk');
var firestoreIndexes = require('../../firestore/indexes');
var logger = require('../../logger');
var RSVP = require('rsvp');
var utils = require('../../utils');

/**
 * Create an index if it does not already exist on the specified project.
 *
 * @param {string} projectId the Firestore project Id.
 * @param {object} index a Firestore index speficiation.
 * @param {object[]} existingIndexes array of existing indexes on the project.
 * @return {Promise} a promise for index creation.
 */
var _createIfMissing = function(projectId, index, existingIndexes) {
  var exists = existingIndexes.some(function(x) {
    return firestoreIndexes.equal(x, index);
  });

  if (exists) {
    logger.debug('Skipping existing index: ' + JSON.stringify(index));
    return RSVP.resolve();
  }

  logger.debug('Creating new index: ' + JSON.stringify(index));
  return firestoreIndexes.create(projectId, index);
};

/**
 * Create a number of indexes on a project, chaining the operations
 * in sequence.
 *
 * @param {string} projectId the Firestore project Id.
 * @param {object[]} indexes array of indexes to create.
 * @param {object[]} existingIndexes array of existing indexes on the project.
 * @return {Promise} a promise representing the entire creation chain.
 */
var _createAllChained = function(projectId, indexes, existingIndexes) {
  if (indexes.length === 0) {
    return RSVP.resolve();
  }

  var index = indexes.shift();
  return _createIfMissing(projectId, index, existingIndexes)
    .then(function() {
      return _createAllChained(projectId, indexes, existingIndexes);
    });
};

/**
 * Get a colored, pretty printed representation of an index.
 *
 * @param {object} index a Firestore index.
 * @return {string} string for logging.
 */
var _toPrettyString = function(index) {
  var result = '';

  if (index.state) {
    var stateMsg = '[' + index.state + '] ';

    if (index.state === 'READY') {
      result += chalk.green(stateMsg);
    } else if (index.state === 'CREATING') {
      result += chalk.yellow(stateMsg);
    } else {
      result += chalk.red(stateMsg);
    }
  }

  result += chalk.cyan('(' + index.collectionId + ')');
  result += ' -- ';

  index.fields.forEach(function(field) {
    if (field.fieldPath === '__name__') {
      return;
    }

    result += '(' + field.fieldPath + ',' + field.mode + ') ';
  });

  return result;
};

/**
 * Warn the user of any indexes that exist in the project but not
 * in their index file.
 *
 * @param {object[]} indexes array of Firestore indexes to be created.
 * @param {object[]} existingIndexes array of Firestore indexes that exit.
 */
var _logAllMissing = function(indexes, existingIndexes) {
  var hashes = {};

  indexes.forEach(function(index) {
    hashes[firestoreIndexes.hash(index)] = true;
  });

  var missingIndexes = existingIndexes.filter(function(index) {
    return !hashes[firestoreIndexes.hash(index)];
  });

  if (missingIndexes.length > 0) {
    logger.info();
    logger.info(chalk.bold('NOTE: ')
      + 'The following indexes are already deployed but not present in the specified indexes file:');

    missingIndexes.forEach(function(index) {
      logger.info(_toPrettyString(index));
    });
    logger.info();
  }
};

function _deployRules(context) {
  var rulesDeploy = _.get(context, 'firestore.rulesDeploy');
  if (!context.firestoreRules || !rulesDeploy) { return RSVP.resolve(); }
  return rulesDeploy.createRulesets();
}

function _deployIndexes(context, options) {
  if (!context.firestoreIndexes) { return RSVP.resolve(); }

  var indexesSrc = _.get(context, 'firestore.indexes.content');
  if (!indexesSrc) {
    logger.debug('No Firestore indexes present.');
    return RSVP.resolve();
  }

  var indexes = indexesSrc.indexes;
  if (!indexes) {
    return utils.reject('Index file must contain an "indexes" property.');
  }

  return firestoreIndexes.list(options.project).then(function(existingIndexes) {
    _logAllMissing(indexes, existingIndexes);
    return _createAllChained(options.project, indexes, existingIndexes);
  });
}

/**
 * Deploy indexes.
 */
module.exports = function(context, options) {
  return RSVP.all([
    _deployRules(context),
    _deployIndexes(context, options)
  ]);
};
