'use strict';

var FirebaseError = require('./error');
var fork = require('child_process').fork;
var path = require('path');

var TRIGGER_PARSER = path.resolve(__dirname, './triggerParser.js');

module.exports = function(projectId, dbInstance, sourceDir) {
  return new RSVP.Promise(function(resolve, reject) {
    var env = {
      GCLOUD_PROJECT: projectId,
      DB_NAMESPACE: dbInstance
    };
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
        reject(new FirebaseError('There was an unknown problem while trying to parse function triggers.', {exit: 2}));
      }
    });
  });
};