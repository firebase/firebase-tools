'use strict';

var chalk = require('chalk');
var RSVP = require('rsvp');

var rtdb = require('../../rtdb');
var utils = require('../../utils');

module.exports = function(context, options) {
  var rulesString = options.config.get('database.rulesString');
  if (!rulesString) {
    return RSVP.resolve();
  }

  context.database = {rulesString: rulesString};
  utils.logBullet(chalk.bold.cyan('database: ') + 'checking rules syntax...');
  return rtdb.updateRules(options.instance, rulesString, {dryRun: true}).then(function() {
    utils.logSuccess(chalk.bold.green('database: ') + 'rules syntax is valid');
  });
};
