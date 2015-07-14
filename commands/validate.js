'use strict';

var validator = require('../lib/validator').firebase;
var Command = require('../lib/command');
var logger = require('../lib/logger');
var logError = require('../lib/logError');

module.exports = new Command('validate')
  .description('check that your firebase.json is valid')
  .action(function(options, resolve) {
    var config = require('../lib/loadConfig')(options.cwd);
    validator.validate(config).then(function() {
      logger.info('Your firebase.json is valid');
      resolve(true);
    }, function(err) {
      logError(err);
      process.exitCode = 2;
    });
  });
