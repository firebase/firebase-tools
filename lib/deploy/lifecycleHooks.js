'use strict';

var RSVP = require('rsvp');
var utils = require('../utils');
var chalk = require('chalk');
var process = require('child_process');
var FirebaseError = require('../error');

module.exports = function(target, hook) {
  // Errors in postdeploy script will not exit the process since it's too late to stop the deploy.
  var exit = hook !== 'postdeploy' ? undefined : {exit: 2};

  return function(context, options) {
    var command  = options.config.get(target + '.' + hook);
    if (!command) {
      return RSVP.resolve();
    }

    utils.logBullet(chalk.cyan.bold(target + ':') + ' running ' + chalk.bold(hook) + ' script.');
    return new RSVP.Promise(function(resolve, reject) {
      var child = process.spawn(command, [], {
        shell: true,
        cwd: options.config.projectDir,
        stdio: [0, 1, 2] // Inherit STDIN, STDOUT, and STDERR
      });

      child.on('error', function(err) {
        reject(new FirebaseError(target + ' ' + hook + ' error: ' + err, exit));
      });
      child.on('exit', function(code, signal) {
        if (signal !== null) {
          reject(new FirebaseError(target + ' ' + hook + ' command terminated with signal ' + signal, exit));
        } else if (code) {
          reject(new FirebaseError(target + ' ' + hook + ' command terminated with non-zero exit code' + code, exit));
        } else {
          utils.logSuccess(chalk.green.bold(target + ':') + ' Finished running ' + chalk.bold(hook) + ' script.');
          resolve();
        }
      });
    });
  };
};

