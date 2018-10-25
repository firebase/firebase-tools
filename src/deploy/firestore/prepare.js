"use strict";

var _ = require("lodash");

var firestoreIndexes = require("../../firestore/indexes");
var RulesDeploy = require("../../RulesDeploy");

function _prepareRules(context, options) {
  var prepare = Promise.resolve();
  var rulesFile = options.config.get("firestore.rules");

  if (context.firestoreRules && rulesFile) {
    var rulesDeploy = new RulesDeploy(options, "firestore");
    _.set(context, "firestore.rulesDeploy", rulesDeploy);
    rulesDeploy.addFile(rulesFile);
    prepare = rulesDeploy.compile();
  }

  return prepare;
}

function _prepareIndexes(context, options) {
  if (!context.firestoreIndexes || !options.config.get("firestore.indexes")) {
    return Promise.resolve();
  }

  return firestoreIndexes.prepare(context, options);
}

module.exports = function(context, options) {
  if (options.only) {
    var targets = options.only.split(",");
    var onlyIndexes = targets.indexOf("firestore:indexes") >= 0;
    var onlyRules = targets.indexOf("firestore:rules") >= 0;
    var onlyFirestore = targets.indexOf("firestore") >= 0;

    context.firestoreIndexes = onlyIndexes || onlyFirestore;
    context.firestoreRules = onlyRules || onlyFirestore;
  } else {
    context.firestoreIndexes = true;
    context.firestoreRules = true;
  }

  return Promise.all([_prepareRules(context, options), _prepareIndexes(context, options)]);
};
