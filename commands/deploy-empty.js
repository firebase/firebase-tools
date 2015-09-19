'use strict';

var Command = require('../lib/command');
var requireAuth = require('../lib/requireAuth');
var logger = require('../lib/logger');
var RSVP = require('rsvp');

module.exports = new Command('deploy:empty')
  .description('deploy an empty site, making site contents inaccessible')
  .option('-f, --firebase <firebase>', 'the name of the firebase to deploy empty')
  .option('-y, --confirm', 'skip confirmation')
  .before(requireAuth)
  .action(function() {
    logger.info('do blank, yo');
    return RSVP.resolve();
  });
