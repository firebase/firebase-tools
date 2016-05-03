'use strict';

var chalk = require('chalk');

var prompt = require('../../prompt');
var logger = require('../../logger');

module.exports = function(setup, config) {
  setup.config.database = {};

  logger.info();
  logger.info('Firebase Realtime Database Rules allow you to define how your data should be');
  logger.info('structured and when your data can be read from and written to. You can keep');
  logger.info('these rules in your project directory and publish them with ' + chalk.bold('firebase deploy') + '.');
  logger.info();

  return prompt(setup.config.database, [
    {
      type: 'input',
      name: 'rules',
      message: 'What file should be used for Database Rules?',
      default: 'database.rules.json'
    }
  ]).then(function() {
    return config.askWriteProjectFile(setup.config.database.rules, {
      '.read': true,
      '.write': true
    });
  });
};
