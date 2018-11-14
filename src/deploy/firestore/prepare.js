"use strict";

var _ = require("lodash");

var loadCJSON = require("../../loadCJSON");
var FirebaseError = require("../../error");
var iv1 = require("../../firestore/indexesV1Beta1");
var iv2 = require("../../firestore/indexesV1Beta2");
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

  var indexesFileName = options.config.get("firestore.indexes");
  var indexesPath = options.config.path(indexesFileName);
  var parsedSrc = loadCJSON(indexesPath);

  if (!parsedSrc.indexes) {
    throw new FirebaseError('Indexes file must contain "indexes" property: ' + indexesPath);
  }

  // TODO: Dedupe version code
  var fsi;
  if (parsedSrc.version == "v1beta1") {
    fsi = iv1;
  } else {
    fsi = new iv2.FirestoreIndexes();
  }

  // TODO: is validate part of the interface?
  parsedSrc.indexes.forEach(function(index) {
    fsi.validate(index);
  });

  context.firestore = context.firestore || {};
  context.firestore.indexes = {
    name: indexesFileName,
    content: parsedSrc,
  };
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
