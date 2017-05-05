'use strict';

var _ = require('lodash');
var chalk = require('chalk');

var Command = require('../lib/command');
var logger = require('../lib/logger');
var utils = require('../lib/utils');
var requireAccess = require('../lib/requireAccess');
var requireConfig = require('../lib/requireConfig');
var checkDupHostingKeys = require('../lib/checkDupHostingKeys');
var serve = require('../lib/serve/index');
var VALID_TARGETS = ['functions', 'hosting'];
var scopes = require('../lib/scopes');

module.exports = new Command('serve')
  .description('start a local server for your static assets')
  .option('-p, --port <port>', 'the port on which to listen (default: 5000)', 5000)
  .option('-o, --host <host>', 'the host on which to listen (default: localhost)', 'localhost')
  .option('--only <targets>', 'only serve specified targets')
  .option('--except <targets>', 'serve all except specified targets')
  .before(requireConfig)
  .before(requireAccess, [scopes.CLOUD_PLATFORM])
  .before(checkDupHostingKeys)
  .action(function(options) {
    if (options.config) {
      logger.info();
      logger.info(chalk.bold(chalk.gray('===') + ' Serving from \'' + options.config.projectDir +  '\'...'));
      logger.info();
    } else {
      utils.logWarning('No Firebase project directory detected. Serving static content from ' + chalk.bold(options.cwd || process.cwd()));
    }

    var targets = VALID_TARGETS.filter(function(t) {
      return options.config.has(t);
    });
    if (options.only && options.except) {
      return utils.reject('Cannot specify both --only and --except', {exit: 1});
    }

    if (options.only) {
      targets = _.intersection(targets, options.only.split(','));
    } else if (options.except) {
      targets = _.difference(targets, options.except.split(','));
    }

    return serve(targets, options);
  });
