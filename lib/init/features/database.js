'use strict';

var chalk = require('chalk');
var api = require('../../api');
var prompt = require('../../prompt');
var logger = require('../../logger');
var utils = require('../../utils');
var fsutils = require('../../fsutils');
var RSVP = require('rsvp');

var _getConsoleDBRules = function(instance) {
  return api.request('GET', '/.settings/rules.json', {
    auth: true,
    origin: utils.addSubdomain(api.realtimeOrigin, instance)
  }).then(function(response) {
    return JSON.stringify(response.body, null, 2);
  });
};

var _writeDBRules = function(instance, filename, config) {
  return _getConsoleDBRules(instance).then(function(rules) {
    return config.writeProjectFile(filename, rules);
  }).then(function() {
    utils.logSuccess('Database Rules for ' + chalk.bold(instance) + ' have been downloaded to ' + chalk.bold(filename) + '.');
    logger.info('Future modifications to ' + chalk.bold(filename) + ' will update Database Rules when you run');
    logger.info(chalk.bold('firebase deploy') + '.');
  });
};

module.exports = function(setup, config) {
  setup.config.database = {};
  var instance = setup.instance;
  var filename = null;

  logger.info();
  logger.info('Firebase Realtime Database Rules allow you to define how your data should be');
  logger.info('structured and when your data can be read from and written to.');
  logger.info();

  return prompt(setup.config.database, [
    {
      type: 'input',
      name: 'rules',
      message: 'What file should be used for Database Rules?',
      default: 'database.rules.json'
    }
  ]).then(function() {
    filename = setup.config.database.rules;

    if (fsutils.fileExistsSync(filename)) {
      var msg = 'File ' + chalk.bold(filename) + ' already exists.'
        + ' Do you want to overwrite it with the Database Rules for ' + chalk.bold(instance)
        + ' from the Firebase Console?';
      return prompt.once({
        type: 'confirm',
        message: msg,
        default: false
      });
    }
    return RSVP.resolve(true);
  }).then(function(overwrite) {
    if (overwrite) {
      return _writeDBRules(instance, filename, config);
    }
    logger.info('Skipping overwrite of Database Rules.');
    logger.info('The rules defined in ' + chalk.bold(filename) + ' will be published when you do ' + chalk.bold('firebase deploy') + '.');
    return RSVP.resolve();
  });
};

