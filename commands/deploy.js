'use strict';

var Command = require('../lib/command');
var requireAuth = require('../lib/requireAuth');
var logger = require('../lib/logger');
var RSVP = require('rsvp');

module.exports = new Command('deploy')
  .description('deploy the current app')
  .option('-f, --firebase <app>', 'override the app specified in firebase.json')
  .before(requireAuth)
  .action(function() {
    logger.info('do deploy, yo');
    return RSVP.resolve();
  });
