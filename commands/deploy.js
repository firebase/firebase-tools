'use strict';

var Command = require('../lib/command');
var requireAuth = require('../lib/requireAuth');
var logger = require('../lib/logger');
var api = require('../lib/api');
var loadConfig = require('../lib/loadConfig');
var loadRules = require('../lib/loadRules');
var getFirebaseName = require('../lib/getFirebaseName');
var validator = require('../lib/validator').firebase;
var chalk = require('chalk');

var _logSuccess = function(message) {
  logger.info(chalk.green('✔ '), message);
};

module.exports = new Command('deploy')
  .description('deploy the current app')
  .option('-f, --firebase <app>', 'override the app specified in firebase.json')
  .before(requireAuth)
  .action(function(options) {
    var firebase = getFirebaseName(options);
    var payload = {};

    var config = loadConfig(options);
    return validator.validate(config).then(function() {
      _logSuccess('firebase.json is valid');
      payload.config = config;
    }).then(function() {
      var rules = loadRules(options);
      if (rules) {
        _logSuccess('rules.json is valid');
        payload.rules = rules;
      }
    }).then(function() {
      return api.request('PUT', '/firebase/' + firebase + '/releases/abcdef', payload, true);
    }).then(function(res) {
      return res.body;
    });
    // Step 1: Validate the config and rules.json
    // Step 2: Create tarball and file manifest
    // Step 3: Upload tarball to hosting upload endpoint
    // Step 4: Create release on Firebase Admin
  });
