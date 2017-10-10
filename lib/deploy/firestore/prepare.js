'use strict';

var _ = require('lodash');
var RSVP = require('rsvp');

var firestoreIndexes = require('../../firestore/indexes');
var RulesDeploy = require('../../RulesDeploy');

function _prepareRules(context, options) {
  var prepare = RSVP.resolve();
  var rulesFile = options.config.get('firestore.rules');

  if (context.firestoreRules && rulesFile) {
    var rulesDeploy = new RulesDeploy(options, 'firestore');
    _.set(context, 'firestore.rulesDeploy', rulesDeploy);
    rulesDeploy.addFile(rulesFile);
    prepare = rulesDeploy.compile();
  }

  return prepare;
}

function _prepareIndexes(context, options) {
  return context.firestoreIndexes ? firestoreIndexes.prepare(context, options) : RSVP.resolve();
}

module.exports = function(context, options) {
  if (options.only) {
    var targets = options.only.split(',');
    var onlyIndexes = targets.indexOf('firestore:indexes') >= 0;
    var onlyRules = targets.indexOf('firestore:rules') >= 0;
    var onlyFirestore = targets.indexOf('firestore') >= 0;

    context.firestoreIndexes = onlyIndexes || onlyFirestore;
    context.firestoreRules = onlyRules || onlyFirestore;
  } else {
    context.firestoreIndexes = true;
    context.firestoreRules = true;
  }

  return RSVP.all([
    _prepareRules(context, options),
    _prepareIndexes(context, options)
  ]);
};
