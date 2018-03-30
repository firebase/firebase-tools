'use strict';

var _ = require('lodash');
var chalk = require('chalk');
var RSVP = require('rsvp');
var semver = require('semver');
var spawn = require('cross-spawn');

var utils = require('./utils');
var logger = require('./logger');

module.exports = function(options) {
  return new RSVP.Promise(function(resolve, reject) {
    var src = options.config._src;
    if (!_.has(src, ['functions'])) {
      return resolve();
    }

    var output;
    var child = spawn('npm', ['outdated', 'firebase-functions', '--json=true'], {
      cwd: options.config.projectDir + '/functions',
      stdio: [0, 'pipe', 2]
    });

    child.on('error', function(err) {
      logger.debug(err.stack);
      return reject(err);
    });

    child.stdout.on('data', function(data) {
      output = JSON.parse(data.toString('utf8'));
    });

    child.on('exit', function() {
      return resolve(output);
    });
  }).then(function(output) {
    return new RSVP.Promise(function(resolve) {
      if (!output) {
        return resolve();
      }

      var current = output['firebase-functions'].current;
      var latest = output['firebase-functions'].latest;

      if (semver.lt(current, latest)) {
        utils.logWarning(chalk.bold.yellow('functions: ') + 'You are running an outdated version of firebase-functions.\n Please upgrade using '
                          + chalk.bold('npm install --save firebase-functions@latest') +  ' in your functions directory.');
        if (semver.satisfies(current, '0.x') && semver.satisfies(latest, '1.x')) {
          utils.logWarning(chalk.bold.yellow('functions: ') + 'Please note that there will be breaking changes when you upgrade.\n Go to '
                            + chalk.bold('https://firebase.google.com/docs/functions/beta-v1-diff') + ' to learn more.');
        }
      }
      return resolve();
    });
  });
};

