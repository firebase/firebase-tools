'use strict';

var RSVP = require('rsvp');

module.exports = function(context, options, payload) {
  payload.database = {rules: options.config.get('database.rules')};

  return RSVP.resolve();
};
