'use strict';

var _ = require('lodash');

var acquireRefs = require('../lib/acquireRefs');
var checkDupHostingKeys = require('../lib/checkDupHostingKeys');
var Command = require('../lib/command');
var deploy = require('../lib/deploy');
var requireConfig = require('../lib/requireConfig');
var scopes = require('../lib/scopes');
var utils = require('../lib/utils');

// in order of least time-consuming to most time-consuming
var VALID_TARGETS = ['database', 'storage', 'functions', 'hosting'];

module.exports = new Command('deploy')
  .description('deploy code and assets to your Firebase project')
  .option('-p, --public <path>', 'override the Hosting public directory specified in firebase.json')
  .option('-m, --message <message>', 'an optional message describing this deploy')
  .option('--only <targets>', 'only deploy to specified, comma-separated targets (e.g. "hosting,storage")')
  .option('--except <targets>', 'deploy to all targets except specified (e.g. "database")')
  .before(requireConfig)
  .before(acquireRefs, function(options) {
    if (options.config.has('functions')) {
      return [scopes.CLOUD_PLATFORM];
    }
    return [];
  })
  .before(checkDupHostingKeys)
  .action(function(options) {
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

    if (targets.length === 0) {
      return utils.reject('No deploy targets found. Valid targets: ' + VALID_TARGETS.join(','), {exit: 1});
    }

    return deploy(targets, options);
  });
