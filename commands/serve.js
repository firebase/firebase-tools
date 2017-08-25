'use strict';

var chalk = require('chalk');

var Command = require('../lib/command');
var logger = require('../lib/logger');
var utils = require('../lib/utils');
var requireAccess = require('../lib/requireAccess');
var requireConfig = require('../lib/requireConfig');
var checkDupHostingKeys = require('../lib/checkDupHostingKeys');
var serve = require('../lib/serve/index');
var scopes = require('../lib/scopes');
var filterTargets = require('../lib/filterTargets');

var VALID_TARGETS = ['functions', 'hosting'];

module.exports = new Command('serve')
  .description('start a local server for your static assets')
  .option('-p, --port <port>', 'the port on which to listen (default: 5000)', 5000)
  .option('-o, --host <host>', 'the host on which to listen (default: localhost)', 'localhost')
  .option('--only <targets>', 'only serve specified targets (valid targets are: functions, hosting)')
  .option('--except <targets>', 'serve all except specified targets (valid targets are: functions, hosting)')
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

    var targets;
    if (options.only || options.except) {
      targets = filterTargets(options, VALID_TARGETS);
    } else {
      targets = ['hosting']; // default to only hosting while functions emulation is experimental
    }
    options.targets = targets;
    return serve(options);
  });
