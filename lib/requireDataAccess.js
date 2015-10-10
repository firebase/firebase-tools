'use strict';
var utils = require('./utils');
var RSVP = require('rsvp');
var requireAccess = require('./requireAccess');

module.exports = function(options) {
  var token = utils.getInheritedOption(options, 'token');

  if (token) {
    options.dataToken = token;
    return RSVP.resolve();
  }

  return requireAccess(options);
};
