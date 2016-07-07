'use strict';

var api = require('./api');
var Firebase = require('firebase');
var RSVP = require('rsvp');
var utils = require('./utils');
var requireAccess = require('./requireAccess');

module.exports = function(options, authScopes) {
  return requireAccess(options, authScopes).then(function() {
    var firebaseRef = new Firebase(utils.addSubdomain(api.realtimeOrigin, 'firebase'));
    options.firebaseRef = firebaseRef;
    return RSVP.resolve();
  });
};
