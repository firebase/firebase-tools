'use strict';

var _ = require('lodash');
var chalk = require('chalk');

var Command = require('../lib/command');
var logger = require('../lib/logger');
var requireConfig = require('../lib/requireConfig');
var utils = require('../lib/utils');

module.exports = new Command('target:apply <type> <name> <resources...>')
  .description('apply a deploy target to a resource')
  .before(requireConfig)
  .action(function(type, name, resources, options) {
    var changes = options.rc.applyTarget(options.project, type, name, resources);

    utils.logSuccess('Applied ' + type + ' target ' + chalk.bold(name) + ' to ' + chalk.bold(resources.join(', ')));
    _.forEach(changes, function(change) {
      utils.logWarning('Previous target ' + chalk.bold(change.target) + ' removed from ' + chalk.bold(change.resource));
    });
    logger.info();
    logger.info('Updated: ' + name + ' (' + options.rc.target(options.project, type, name).join(',') + ')');
  });
