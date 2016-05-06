'use strict';
var utils = require('./utils');
var RSVP = require('rsvp');
var requireAccess = require('./requireAccess');

module.exports = function(options, authScopes) {
  var token = utils.getInheritedOption(options, 'token');

  if (token) {
    options.databaseAdminToken = token;
    return RSVP.resolve();
  }

  return requireAccess(options, authScopes);
};
