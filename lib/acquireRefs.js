"use strict";

var FirebaseError = require("./error");
var api = require("./api");
var Firebase = require("firebase");

var utils = require("./utils");
var requireAccess = require("./requireAccess");

module.exports = function(options, authScopes) {
  return requireAccess(options, authScopes).then(function() {
    return new Promise(function(resolve, reject) {
      if (process.env.FIREBASE_BYPASS_ADMIN_CALLS_FOR_TESTING === "true") {
        // requireAccess() hasn't set the metadataToken, so can't auth.
        resolve();
      }

      var firebaseRef = new Firebase(utils.addSubdomain(api.realtimeOrigin, "firebase"));
      firebaseRef.authWithCustomToken(options.metadataToken, function(err) {
        if (err) {
          return reject(
            new FirebaseError("Failed to authenticate to Firebase", {
              original: err,
            })
          );
        }
        options.firebaseRef = firebaseRef;
        resolve();
      });
    });
  });
};
