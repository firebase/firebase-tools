'use strict';

var chalk = require('chalk');
var api = require('../../api');
var prompt = require('../../prompt');
var logger = require('../../logger');
var configstore = require('../../configstore');
var utils = require('../../utils');
var fsutils = require('../../fsutils');
var RSVP = require('rsvp');

var _getConsoleDBRules = function(projectId) {
  return api.request('GET', '/.settings/rules.json', {
    auth: true,
    origin: utils.addSubdomain(api.realtimeOrigin, projectId)
  }).then(function(response) {
    return JSON.stringify(response.body, null, 2);
  });
};

var _writeDBRules = function(projectId, fileName, config) {
  return _getConsoleDBRules(projectId).then(function(rules) {
    return config.writeProjectFile(fileName, rules);
  }).then(function() {
    utils.logSuccess('Database Rules for ' + projectId + ' have been downloaded to ' + fileName + ' .');
    logger.info('Future modifications to ' + fileName + ' will update Database Rules when you do');
    logger.info(chalk.bold('firebase deploy') + '.');
  });
};

module.exports = function(setup, config) {
  setup.config.database = {};
  var projectId = configstore.get('activeProjects')[config.projectDir];
  var fileName = null;

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
    fileName = setup.config.database.rules;

    if (fsutils.fileExistsSync(fileName)) {
      var msg = 'File ' + chalk.underline(fileName) + ' already exists.'
        + ' Do you want to overwrite it with the Database Rules for ' + projectId
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
      return _writeDBRules(projectId, fileName, config);
    }
    logger.info('Skipping overwrite of Database Rules.');
    logger.info('The rules defined in ' + fileName + ' will be published when you do ' + chalk.bold('firebase deploy') + '.');
    return RSVP.resolve();
  });
};

