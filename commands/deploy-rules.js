'use strict';

var Command = require('../lib/command');
var requireAuth = require('../lib/requireAuth');
var acquireRefs = require('../lib/acquireRefs');
var deploy = require('../lib/deploy');
var Config = require('../lib/config');
var RSVP = require('rsvp');
var utils = require('../lib/utils');

module.exports = new Command('deploy:rules')
  .description('deploy security rules for the current app')
  .option('-f, --firebase <app>', 'override the app specified in firebase.json')
  .option('-m, --message <message>', 'an optional message describing this deploy')
  .before(requireAuth)
  .before(acquireRefs)
  .action(function(options) {
    var config = Config.load(options);
    if (!config.rules) {
      utils.logSuccess('Nothing to deploy (no "rules" specified in firebase.json)');
      return RSVP.resolve();
    }
    return deploy(['rules'], options);
  });
