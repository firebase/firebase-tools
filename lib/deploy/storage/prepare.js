'use strict';

var prepareFirebaseRules = require('../../prepareFirebaseRules');

module.exports = function(context, options, payload) {
  return prepareFirebaseRules('storage', options, payload);
};
