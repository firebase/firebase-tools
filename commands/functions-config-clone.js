'use strict';

var chalk = require('chalk');
var Command = require('../lib/command');
var functionsConfig = require('../lib/functionsConfig');
var functionsConfigClone = require('../lib/functionsConfigClone');
var getProjectId = require('../lib/getProjectId');
var requireAccess = require('../lib/requireAccess');
var scopes = require('../lib/scopes');
var utils = require('../lib/utils');
var logger = require('../lib/logger');

module.exports = new Command('functions:config:clone')
  .description('clone environment config from another project')
  .option('--from <projectId>', 'the project from which to clone configuration')
  .option('--only <keys>', 'a comma-separated list of keys to clone')
  .option('--except <keys>', 'a comma-separated list of keys to not clone')
  .before(requireAccess, [scopes.CLOUD_PLATFORM])
  .before(functionsConfig.ensureApi)
  .action(function(options) {
    var projectId = getProjectId(options);
    if (!options.from) {
      return utils.reject('Must specify a source project in ' + chalk.bold('--from <projectId>') + ' option.');
    } else if (options.from === projectId) {
      return utils.reject('From project and destination can\'t be the same project.');
    } else if (options.only && options.except) {
      return utils.reject('Cannot use both --only and --except at the same time.');
    }

    var only;
    var except;
    if (options.only) {
      only = options.only.split(',');
    } else if (options.except) {
      except = options.except.split(',');
    }

    return functionsConfigClone(options.from, projectId, only, except).then(function() {
      utils.logSuccess('Cloned functions config from ' + chalk.bold(options.from) + ' into ' + chalk.bold(projectId));
      logger.info('\nPlease deploy your functions for the change to take effect by running '
        + chalk.bold('firebase deploy --only functions') + '\n');
    });
  });
