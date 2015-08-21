'use strict';

var Command = require('../lib/command');
var requireAuth = require('../lib/requireAuth');
var logger = require('../lib/logger');
var RSVP = require('rsvp');

module.exports = new Command('blank')
  .description('creates a blank site release, wiping all static asset content')
  .option('-f, --firebase <firebase>', 'the name of the firebase to blank')
  .option('-y, --confirm', 'skip confirmation and immediately blank')
  .before(requireAuth)
  .action(function() {
    logger.info('do blank, yo');
    return RSVP.resolve();
  });
