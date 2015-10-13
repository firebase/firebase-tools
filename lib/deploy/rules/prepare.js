'use strict';

var RSVP = require('rsvp');

module.exports = function(context, options, payload) {
  payload.rules = options.config.get('rules');
  return RSVP.resolve();
};
