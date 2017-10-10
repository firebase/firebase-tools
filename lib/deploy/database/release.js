'use strict';

var chalk = require('chalk');
var RSVP = require('rsvp');

var rtdb = require('../../rtdb');
var utils = require('../../utils');

module.exports = function(context, options) {
  if (!context.database || !context.database.rulesString) {
    return RSVP.resolve();
  }

  var rulesString = context.database.rulesString;

  utils.logBullet(chalk.bold.cyan('database: ') + 'releasing rules...');
  return rtdb.updateRules(options.instance, rulesString).then(function() {
    utils.logSuccess(chalk.bold.green('database: ') + 'rules released successfully');
  });
};
