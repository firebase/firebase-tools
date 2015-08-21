'use strict';

var Command = require('../lib/command');
var requireAuth = require('../lib/requireAuth');
var logger = require('../lib/logger');
var RSVP = require('rsvp');

module.exports = new Command('bootstrap')
  .description('initialize an app from a prebuilt template')
  .option('-f, --firebase <firebase>', 'the name of the firebase to use')
  .option('-t, --template <template>', 'the name of the template to use')
  .before(requireAuth)
  .action(function() {
    logger.info('do bootstrap, yo');
    return RSVP.resolve();
  });
