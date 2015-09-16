'use strict';

var auth = require('./auth');
var getFirebaseName = require('./getFirebaseName');
var FirebaseError = require('./error');
var api = require('./api');
var Firebase = require('firebase');
var RSVP = require('rsvp');

module.exports = function(options) {
  var firebase = getFirebaseName(options);
  return auth.checkCanAccess(firebase).then(function(res) {
    return new RSVP.Promise(function(resolve, reject) {
      var firebaseRef = new Firebase(api.realtimeOrigin.replace(/\/\//, '//firebase.'));
      firebaseRef.authWithCustomToken(res.body.firebaseToken, function(err) {
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
