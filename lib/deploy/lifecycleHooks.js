'use strict';

var RSVP = require('rsvp');
var utils = require('../utils');
var chalk = require('chalk');
var process = require('child_process');
var FirebaseError = require('../error');

module.exports = function(target, hook) {
  // Errors in postdeploy script will not exit the process since it's too late to stop the deploy.
  var exit = hook !== 'postdeploy';

  return function(context, options) {
    var command  = options.config.get(target + '.' + hook);
    if (!command) {
      return RSVP.resolve();
    }

    utils.logSuccess(chalk.green.bold(target + ':') + ' running ' + hook + ' command.');
    return new RSVP.Promise(function(resolve, reject) {
      var child = process.spawn(command, [], {
        shell: true,
        // Note: should this instead be the dir of the feature? Is this a common concept?
        cwd: options.config.projectDir,
        stdio: [0, 1, 2] // Inherit STDIN, STDOUT, and STDERR
      });

      child.on('error', function(err) {
        reject(new FirebaseError(target + ' ' + hook + 'command failed with error ' + err, {exit: exit}));
      });
      child.on('exit', function(code, signal) {
        if (signal !== null) {
          reject(new FirebaseError(target + ' ' + hook + ' command terminated with signal ' + signal, {exit: exit}));
        } else if (code) {
          reject(new FirebaseError(target + ' ' + hook + ' command exited with status ' + code, {exit: exit}));
        } else {
          resolve();
        }
      });
    });
  };
};

