'use strict';

var chalk = require('chalk');
var Command = require('../lib/command');
var env = require('../lib/env');
var getProjectId = require('../lib/getProjectId');
var requireAccess = require('../lib/requireAccess');
var scopes = require('../lib/scopes');
var utils = require('../lib/utils');

module.exports = new Command('env:set [values...]')
  .description('set environment config with key=value syntax')
  .before(requireAccess, [scopes.CLOUD_PLATFORM])
  .action(function(args, options) {
    if (!args.length) {
      return utils.reject('Must supply at least one key/value pair, e.g. ' + chalk.bold('app.name="My App"'));
    }

    var projectId = getProjectId(options);
    var changed;
    var data;
    return env.get(projectId).then(function(latest) {
      data = latest.data;
      changed = env.applyArgs(data, args);
      return env.set(projectId, data, env.nextVersion(latest.version));
    }).then(function() {
      var message = 'Environment updated.';
      if (changed.length > 0) {
        message += ' Changed: ' + chalk.bold(changed.join(','));
      }

      utils.logSuccess(message);
      return data;
    });
  });
