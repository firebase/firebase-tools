'use strict';

var Command = require('../lib/command');
var requireAccess = require('../lib/requireAccess');
var requireConfig = require('../lib/requireConfig');
var acquireRefs = require('../lib/acquireRefs');
var deploy = require('../lib/deploy');

module.exports = new Command('deploy:functions')
  .description('deploy functions of the current app')
  .option('-P, --project <project_id>', 'override the project ID specified in firebase.json')
  .before(requireConfig)
  .before(requireAccess)
  .before(acquireRefs)
  .action(function(options) {
    return deploy(['functions'], options);
  });
