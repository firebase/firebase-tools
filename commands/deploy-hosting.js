'use strict';

var Command = require('../lib/command');
var requireAuth = require('../lib/requireAuth');
var acquireRefs = require('../lib/acquireRefs');
var deploy = require('../lib/deploy');

module.exports = new Command('deploy:hosting')
  .description('deploy hosting assets for the current app')
  .option('-f, --firebase <app>', 'override the app specified in firebase.json')
  .option('-m, --message <message>', 'an optional message describing this deploy')
  .before(requireAuth)
  .before(acquireRefs)
  .action(function(options) {
    return deploy(['hosting'], options);
  });
