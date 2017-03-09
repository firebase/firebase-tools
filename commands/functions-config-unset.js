'use strict';

var _ = require('lodash');
var RSVP = require('rsvp');
var chalk = require('chalk');
var Command = require('../lib/command');
var functionsConfig = require('../lib/functionsConfig');
var getProjectId = require('../lib/getProjectId');
var logger = require('../lib/logger');
var requireAccess = require('../lib/requireAccess');
var scopes = require('../lib/scopes');
var utils = require('../lib/utils');
var runtimeconfig = require('../lib/gcp/runtimeconfig');

module.exports = new Command('functions:config:unset [keys...]')
  .description('unset environment config at the specified path(s)')
  .before(requireAccess, [scopes.CLOUD_PLATFORM])
  .before(functionsConfig.ensureApi)
  .action(function(args, options) {
    if (!args.length) {
      return utils.reject('Must supply at least one key, e.g. ' + chalk.bold('app.name'));
    }
    var projectId = getProjectId(options);
    var parsed = functionsConfig.parseUnsetArgs(args);
    return RSVP.all(_.map(parsed, function(item) {
      if (item.varId === '') {
        return runtimeconfig.configs.delete(projectId, item.configId);
      }
      return runtimeconfig.variables.delete(projectId, item.configId, item.varId);
    })).then(function() {
      utils.logSuccess('Environment updated.');
      logger.info('\nPlease deploy your functions for the change to take effect by running '
        + chalk.bold('firebase deploy --only functions') + '\n');
    });
  });
