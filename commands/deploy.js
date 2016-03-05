'use strict';

var Command = require('../lib/command');
var requireAccess = require('../lib/requireAccess');
var requireConfig = require('../lib/requireConfig');
var acquireRefs = require('../lib/acquireRefs');
var deploy = require('../lib/deploy');

module.exports = new Command('deploy')
  .description('deploy hosting assets and rules for the current app')
  .option('-p, --public <path>', 'override the public directory specified in firebase.json')
  .option('-m, --message <message>', 'an optional message describing this deploy')
  .before(requireConfig)
  .before(requireAccess)
  .before(acquireRefs)
  .action(function(options) {
    // deploy in order of least time-consuming to most time-consuming
    return deploy(['rules', 'storage', 'functions', 'hosting'], options);
  });
