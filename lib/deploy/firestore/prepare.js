'use strict';

var firestoreIndexes = require('../../firestore/indexes');
var prepareFirebaseRules = require('../../prepareFirebaseRules');
var RSVP = require('rsvp');

module.exports = function(context, options, payload) {
  if (options.only) {
    var targets = options.only.split(',');
    var onlyIndexes = targets.indexOf('firestore:indexes') >= 0;
    var onlyRules = targets.indexOf('firestore:rules') >= 0;
    var onlyFirestore = targets.indexOf('firestore') >= 0;

    options.firestoreIndexes = onlyIndexes || onlyFirestore;
    options.firestoreRules = onlyRules || onlyFirestore;
  }

  var prepareRules = options.firestoreRules
    ? prepareFirebaseRules('firestore', options, payload)
    : RSVP.resolve();

  var prepareIndexes = options.firestoreIndexes
    ? firestoreIndexes.prepare(context, options)
    : RSVP.resolve();

  return RSVP.all([prepareRules, prepareIndexes]);
};
