'use strict';

var RSVP = require('rsvp');
var loadRules = require('../../loadRules');
var Config = require('../../config');
var utils = require('../../utils');
var chalk = require('chalk');

module.exports = function(context, options, payload) {
  var config = Config.load(options);
  payload.rules = loadRules();
  utils.logSuccess('read security rules from ' + chalk.bold(config.rules));
  return RSVP.resolve();
};
