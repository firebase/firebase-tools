'use strict';

var _ = require('lodash');
var RSVP = require('rsvp');
var utils = require('./utils');
var chalk = require('chalk');
var Config = require('./config');
var FirebaseError = require('./error');
var logger = require('./logger');

module.exports = function(options) {
  return new RSVP.Promise(function(resolve, reject) {
    var src = options.config._src;
    var legacyKeys = Config.LEGACY_HOSTING_KEYS;

    var hasLegacyKeys = _.reduce(legacyKeys, function(result, key) {
      return result || _.has(src, key);
    }, false);


    if (hasLegacyKeys && _.has(src, ['hosting'])) {
      utils.logWarning(chalk.bold.yellow('hosting: ') + 'We found a ' + chalk.bold('hosting') + ' key inside ' + chalk.bold('firebase.json') + ' as well as hosting configuration keys that are not nested inside the ' + chalk.bold('hosting') + ' key.');
      logger.info('\n\nPlease run ' + chalk.bold('firebase tools:migrate') + ' to fix this issue.');
      logger.info('Please note that this will overwrite any configuration keys nested inside the ' + chalk.bold('hosting') + ' key with configuration keys at the root level of ' + chalk.bold('firebase.json.'));
      reject(new FirebaseError('Hosting key and legacy hosting keys are both present in firebase.json.'));
    } else {
      resolve();
    }
  });
};

