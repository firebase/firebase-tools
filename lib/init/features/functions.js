'use strict';

var chalk = require('chalk');
var fs = require('fs');
var RSVP = require('rsvp');
var spawn = require('cross-spawn');

var logger = require('../../logger');
var prompt = require('../../prompt');

var INDEX_TEMPLATE = fs.readFileSync(__dirname + '/../../../templates/init/functions/index.js', 'utf8');

module.exports = function(setup, config) {
  logger.info();
  logger.info('A ' + chalk.bold('functions') + ' directory will be created in your project with a Node.js');
  logger.info('package pre-configured. Functions can be deployed with ' + chalk.bold('firebase deploy') + '.');
  logger.info();

  setup.functions = {};
  return config.askWriteProjectFile('functions/package.json', {
    name: 'functions',
    description: 'Firebase Functions',
    dependencies: {
      'firebase': '^3.1',
      'firebase-functions': 'https://storage.googleapis.com/firebase-preview-drop/node/firebase-functions/firebase-functions-preview.latest.tar.gz'
    }
  }).then(function() {
    return config.askWriteProjectFile('functions/index.js', INDEX_TEMPLATE);
  }).then(function() {
    return prompt(setup.functions, [
      {
        name: 'npm',
        type: 'confirm',
        message: 'Do you want to install dependencies with npm now?',
        default: true
      }
    ]);
  }).then(function() {
    if (setup.functions.npm) {
      return new RSVP.Promise(function(resolve) {
        var installer = spawn('npm', ['install'], {
          cwd: config.projectDir + '/functions',
          stdio: 'inherit'
        });

        installer.on('error', function(err) {
          logger.debug(err.stack);
        });

        installer.on('close', function(code) {
          if (code === 0) {
            return resolve();
          }
          logger.info();
          logger.error('NPM install failed, continuing with Firebase initialization...');
          return resolve();
        });
      });
    }
  });
};
