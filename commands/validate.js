'use strict';

var validator = require('../lib/validator').firebase;
var Command = require('../lib/command');
var logger = require('../lib/logger');
var chalk = require('chalk');
var loadConfig = require('../lib/loadConfig');
var loadRules = require('../lib/loadRules');

module.exports = new Command('validate')
  .description('check that your firebase.json is valid')
  .action(function(options) {
    var config = loadConfig(options);
    return validator.validate(config).then(function() {
      logger.info(chalk.green('✔ '), 'Your firebase.json is valid');
    }).then(function() {
      var rules = loadRules(options);
      if (rules) {
        logger.info(chalk.green('✔ '), 'Your rules.json is valid');
      }
      return true;
    });
  });
