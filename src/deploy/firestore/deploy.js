"use strict";

const _ = require("lodash");
const clc = require("cli-color");

const fsi = require("../../firestore/indexes");
const logger = require("../../logger");
const utils = require("../../utils");
const { RulesetServiceType } = require("../../RulesDeploy");

function _deployRules(context) {
  var rulesDeploy = _.get(context, "firestore.rulesDeploy");
  if (!context.firestoreRules || !rulesDeploy) {
    return Promise.resolve();
  }
  return rulesDeploy.createRulesets(RulesetServiceType.CLOUD_FIRESTORE);
}

function _deployIndexes(context, options) {
  if (!context.firestoreIndexes) {
    return Promise.resolve();
  }

  var indexesFileName = _.get(context, "firestore.indexes.name");
  var indexesSrc = _.get(context, "firestore.indexes.content");
  if (!indexesSrc) {
    logger.debug("No Firestore indexes present.");
    return Promise.resolve();
  }

  var indexes = indexesSrc.indexes;
  if (!indexes) {
    return utils.reject('Index file must contain an "indexes" property.');
  }

  var fieldOverrides = indexesSrc.fieldOverrides || [];

  return new fsi.FirestoreIndexes()
    .deploy(options.project, indexes, fieldOverrides)
    .then(function() {
      utils.logSuccess(
        clc.bold.green("firestore:") +
          " deployed indexes in " +
          clc.bold(indexesFileName) +
          " successfully"
      );
    });
}

/**
 * Deploy indexes.
 */
module.exports = function(context, options) {
  return Promise.all([_deployRules(context), _deployIndexes(context, options)]);
};
