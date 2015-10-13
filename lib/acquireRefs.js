'use strict';

// var getFirebaseName = require('./getFirebaseName');
var FirebaseError = require('./error');
var api = require('./api');
var Firebase = require('firebase');
var RSVP = require('rsvp');
var utils = require('./utils');
var requireAccess = require('./requireAccess');

module.exports = function(options) {
  return requireAccess(options).then(function() {
    return new RSVP.Promise(function(resolve, reject) {
      var firebaseRef = new Firebase(utils.addSubdomain(api.realtimeOrigin, 'firebase'));
      firebaseRef.authWithCustomToken(options.adminToken, function(err) {
        if (err) {
          return reject(new FirebaseError('Failed to authenticate to Firebase', {
            original: err
          }));
        }
        options.firebaseRef = firebaseRef;
        resolve();
      });
    });
  });
};
