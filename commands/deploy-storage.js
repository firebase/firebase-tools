'use strict';

var Command = require('../lib/command');
var requireAccess = require('../lib/requireAccess');
var requireConfig = require('../lib/requireConfig');
var acquireRefs = require('../lib/acquireRefs');
var deploy = require('../lib/deploy');
var RSVP = require('rsvp');
var utils = require('../lib/utils');

module.exports = new Command('deploy:storage')
  .description('deploy authorization rules for Firebase Storage')
  .before(requireConfig)
  .before(requireAccess)
  .before(acquireRefs)
  .action(function(options) {
    if (!options.config.get('storage.rules')) {
      utils.logSuccess('Nothing to deploy (no "storage.rules" specified in firebase.json)');
      return RSVP.resolve();
    }
    return deploy(['storage'], options);
  });
