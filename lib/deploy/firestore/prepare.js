'use strict';

var prepareFirebaseRules = require('../../prepareFirebaseRules');

module.exports = function(context, options, payload) {
  prepareFirebaseRules('firestore', options, payload);
};
