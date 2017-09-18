'use strict';

var chalk = require('chalk');
var RSVP = require('rsvp');

var Command = require('../lib/command');
var requireConfig = require('../lib/requireConfig');
var utils = require('../lib/utils');

module.exports = new Command('target:remove <type> <resource>')
  .description('remove a resource target')
  .before(requireConfig)
  .action(function(type, resource, options) {
    var name = options.rc.removeTarget(options.project, type, resource);
    if (name) {
      utils.logSuccess('Removed ' + type + ' target ' + chalk.bold(name) + ' from ' + chalk.bold(resource));
    } else {
      utils.logWarning('No action taken. No target found for ' + type + ' resource ' + chalk.bold(resource));
    }
    return RSVP.resolve(name);
  });
