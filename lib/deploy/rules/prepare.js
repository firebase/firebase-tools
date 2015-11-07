'use strict';

var RSVP = require('rsvp');
var _ = require('lodash');
var FirebaseError = require('../../error');

// recursively search an object for a key name
var _hasDeepKey = function(obj, key) {
  if (_.has(obj, key)) {
    return true;
  }

  for (var k in obj) {
    if (_.isPlainObject(obj[k]) && _hasDeepKey(obj[k], key)) {
      return true;
    }
  }
  return false;
};

module.exports = function(context, options, payload) {
  payload.rules = options.config.get('rules');

  if (_hasDeepKey(payload.rules, '.function')) {
    return RSVP.reject(new FirebaseError('Cannot define .function in rules, please use functions config instead', {exit: 1}));
  }
  return RSVP.resolve();
};
