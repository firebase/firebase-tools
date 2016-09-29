'use strict';

var chalk = require('chalk');
var Command = require('../lib/command');
var env = require('../lib/env');
var getProjectId = require('../lib/getProjectId');
var requireAccess = require('../lib/requireAccess');
var scopes = require('../lib/scopes');
var utils = require('../lib/utils');

module.exports = new Command('env:clone')
  .description('clone environment config from another project')
  .option('--from <projectId>', 'the project from which to clone configuration')
  .option('--only <keys>', 'a comma-separated list of keys to clone')
  .before(requireAccess, [scopes.CLOUD_PLATFORM])
  .action(function(options) {
    var projectId = getProjectId(options);
    if (!options.from) {
      return utils.reject('Must specify a source project in ' + chalk.bold('--from <projectId>') + ' option.');
    } else if (options.from === projectId) {
      return utils.reject('From project and destination can\'t be the same project.');
    }

    var only;
    var except;
    if (options.only) {
      only = options.only.split(',');
    } else if (options.except) {
      except = options.except.split(',');
    }

    return env.clone(options.from, projectId, only, except).then(function() {
      utils.logSuccess('Cloned environment from ' + chalk.bold(options.from) + ' into ' + chalk.bold(projectId));
    });
  });
