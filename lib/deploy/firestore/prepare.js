'use strict';

var prepareFirebaseRules = require('../../prepareFirebaseRules');

module.exports = function(context, options, payload) {
  return prepareFirebaseRules('firestore', options, payload);
};
