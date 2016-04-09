'use strict';

var chalk = require('chalk');
var fs = require('fs');

var prompt = require('../../prompt');
var logger = require('../../logger');

var RULES_TEMPLATE = fs.readFileSync(__dirname + '/../../../templates/init/storage/storage.rules', 'utf8');

module.exports = function(setup, config) {
  setup.config.storage = {};

  logger.info();
  logger.info('Rules allow you to define how and when to allow uploads and downloads via');
  logger.info('Firebase Storage. You can keep these rules in your project directory and');
  logger.info('publish them with ' + chalk.bold('firebase deploy') + '.');
  logger.info();

  return prompt(setup.config.storage, [
    {
      type: 'input',
      name: 'rules',
      message: 'What file should be used for Firebase Storage rules?',
      default: 'storage.rules'
    }
  ]).then(function() {
    return config.writeProjectFile(setup.config.storage.rules, RULES_TEMPLATE);
  });
};
