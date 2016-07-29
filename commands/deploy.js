'use strict';

var _ = require('lodash');

var acquireRefs = require('../lib/acquireRefs');
var checkDupHostingKeys = require('../lib/checkDupHostingKeys');
var Command = require('../lib/command');
var deploy = require('../lib/deploy');
var previews = require('../lib/previews');
var requireConfig = require('../lib/requireConfig');
var scopes = require('../lib/scopes');
var utils = require('../lib/utils');

// in order of least time-consuming to most time-consuming
var VALID_TARGETS = ['database', 'storage', 'functions', 'hosting'];
if (!previews.functions) {
  VALID_TARGETS.splice(2, 1);
}

var deployScopes = previews.functions ? [scopes.CLOUD_PLATFORM] : [];

module.exports = new Command('deploy')
  .description('deploy code and assets to your Firebase project')
  .option('-p, --public <path>', 'override the Hosting public directory specified in firebase.json')
  .option('-m, --message <message>', 'an optional message describing this deploy')
  .option('--only <targets>', 'only deploy to specified, comma-separated targets (e.g. "hosting,storage")')
  .option('--except <targets>', 'deploy to all targets except specified (e.g. "database")')
  .before(requireConfig)
  .before(acquireRefs, deployScopes)
  .before(checkDupHostingKeys)
  .action(function(options) {
    var targets = VALID_TARGETS;
    if (options.only && options.except) {
      return utils.reject('Cannot specify both --only and --except', {exit: 1});
    }

    if (options.only) {
      targets = _.intersection(targets, options.only.split(','));
    } else if (options.except) {
      targets = _.difference(targets, options.except.split(','));
    }

    return deploy(targets, options);
  });
