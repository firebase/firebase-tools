'use strict';

var Command = require('../lib/command');
var requireAccess = require('../lib/requireAccess');
var requireConfig = require('../lib/requireConfig');
var acquireRefs = require('../lib/acquireRefs');
var deploy = require('../lib/deploy');
var RSVP = require('rsvp');
var utils = require('../lib/utils');

module.exports = new Command('deploy:database')
  .description('deploy security rules for your Firebase Database')
  .option('-m, --message <message>', 'an optional message describing this deploy')
  .before(requireConfig)
  .before(requireAccess)
  .before(acquireRefs)
  .action(function(options) {
    var config = options.config;
    if (!config.has('database.rules')) {
      utils.logSuccess('Nothing to deploy (no "database.rules" specified in firebase.json)');
      return RSVP.resolve();
    }
    return deploy(['database'], options);
  });
