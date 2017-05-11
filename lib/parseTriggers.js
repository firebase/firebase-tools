'use strict';

var FirebaseError = require('./error');
var fork = require('child_process').fork;
var path = require('path');
var RSVP = require('rsvp');

var TRIGGER_PARSER = path.resolve(__dirname, './triggerParser.js');

module.exports = function(projectId, sourceDir, firebaseConfig) {
  return new RSVP.Promise(function(resolve, reject) {
    var env = {
      GCLOUD_PROJECT: projectId
    };
    if (firebaseConfig) {
      env.FIREBASE_PROJECT = firebaseConfig;
    }
    var parser = fork(TRIGGER_PARSER, [sourceDir], {silent: true, env: env});

    parser.on('message', function(message) {
      if (message.triggers) {
        resolve(message.triggers);
      } else if (message.error) {
        reject(new FirebaseError(message.error, {exit: 1}));
      }
    });

    parser.on('exit', function(code) {
      if (code !== 0) {
        reject(new FirebaseError('There was an unknown problem while trying to parse function triggers. ' +
          'Please ensure you are using Node.js v6 or greater.', {exit: 2}));
      }
    });
  });
};
