'use strict';

var RSVP = require('rsvp');
var utils = require('../../utils');
var chalk = require('chalk');

module.exports = function(context, options, payload) {
  payload.database = {rules: options.config.get('database.rules')};
  utils.logSuccess(chalk.green.bold('database:') + ' rules ready to deploy.');
  return RSVP.resolve();
};
