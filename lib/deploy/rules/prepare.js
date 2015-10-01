'use strict';

var RSVP = require('rsvp');
var loadRules = require('../../loadRules');
var loadConfig = require('../../loadConfig');
var utils = require('../../utils');
var chalk = require('chalk');

module.exports = function(context, options, payload) {
  var config = Config.load(options);
  payload.rules = loadRules();
  utils.logSuccess('read security rules from ' + chalk.bold(config.rules));
  return RSVP.resolve();
};
