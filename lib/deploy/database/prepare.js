'use strict';

var RSVP = require('rsvp');
var utils = require('../../utils');
var chalk = require('chalk');

module.exports = function(context, options, payload) {
  payload.database = {rulesString: options.config.get('database.rulesString')};
  utils.logSuccess(chalk.green.bold('database:') + ' rules ready to deploy.');
  return RSVP.resolve();
};
