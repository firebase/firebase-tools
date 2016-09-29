'use strict';

var _ = require('lodash');
var chalk = require('chalk');
var Command = require('../lib/command');
var env = require('../lib/env');
var getProjectId = require('../lib/getProjectId');
var requireAccess = require('../lib/requireAccess');
var scopes = require('../lib/scopes');
var utils = require('../lib/utils');

module.exports = new Command('env:unset [keys...]')
  .description('unset environment config at the specified path(s)')
  .before(requireAccess, [scopes.CLOUD_PLATFORM])
  .action(function(args, options) {
    if (!args.length) {
      return utils.reject('Must supply at least one key, e.g. ' + chalk.bold('app.name'));
    }

    for (var i = 0; i < args.length; i++) {
      var namespace = args[i].split('.')[0];
      if (_.includes(env.RESERVED_NAMESPACES, namespace)) {
        return utils.reject('Cannot unset reserved namespace ' + chalk.bold(namespace));
      }
    }

    var projectId = getProjectId(options);
    var existed;
    var data;
    return env.get(projectId).then(function(latest) {
      data = latest.data;
      existed = env.applyUnsetArgs(data, args);
      return env.set(projectId, data, env.nextVersion(latest.version));
    }).then(function() {
      var message = 'Environment updated.';
      if (existed.length > 0) {
        message += ' Removed: ' + chalk.bold(existed.join(','));
      }

      utils.logSuccess(message);
      return data;
    });
  });
