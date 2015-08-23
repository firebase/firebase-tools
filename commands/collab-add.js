'use strict';

var Command = require('../lib/command');
var requireAuth = require('../lib/requireAuth');
var logger = require('../lib/logger');
var RSVP = require('rsvp');

module.exports = new Command('collab:add <email>')
  .description('invite a collaborator to the current app')
  .option('-f, --firebase <app>', 'override the app specified in firebase.json')
  .before(requireAuth)
  .action(function(email, options) {
    console.log(email);
    console.log(options);
    logger.info('do deploy, yo');
    return RSVP.resolve();
  });
