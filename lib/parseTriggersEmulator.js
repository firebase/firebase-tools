'use strict';

var fork = require('child_process').fork;
var path = require('path');
var RSVP = require('rsvp');

var TRIGGER_PARSER = path.resolve(__dirname, './triggerParser.js');

module.exports = function(firebaseConfig, projectId, dbInstance, sourceDir) {
  return new RSVP.Promise(function(resolve, reject) {
    var env = {
      GCLOUD_PROJECT: projectId,
      DB_NAMESPACE: dbInstance,
      FIREBASE_PROJECT: firebaseConfig
    };
    var parser = fork(TRIGGER_PARSER, [sourceDir], {silent: true, env: env});

    parser.on('message', function(message) {
      if (message.triggers) {
        resolve(message.triggers);
      } else if (message.error) {
        reject(new Error(message.error));
      }
    });

    parser.on('exit', function(code) {
      if (code !== 0) {
        reject(new Error('There was an unknown problem while trying to parse function triggers. ' +
          'Please ensure you are using Node.js v6 or greater.'));
      }
    });
  });
};
