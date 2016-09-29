'use strict';

var Command = require('../lib/command');
var env = require('../lib/env');
var getProjectId = require('../lib/getProjectId');
var logger = require('../lib/logger');
var requireAccess = require('../lib/requireAccess');
var scopes = require('../lib/scopes');

module.exports = new Command('env:get [path]')
  .description('fetch environment config stored at the given path')
  .before(requireAccess, [scopes.CLOUD_PLATFORM])
  .action(function(path, options) {
    return env.ensureSetup(options).then(function() {
      return env.get(getProjectId(options));
    }).then(function(result) {
      logger.info(JSON.stringify(result.data, null, 2));
      return result.data;
    });
  });
