'use strict';

var Command = require('../lib/command');
var requireAuth = require('../lib/requireAuth');
var logger = require('../lib/logger');
var RSVP = require('rsvp');
var api = require('../lib/api');
var getFirebaseName = require('../lib/getFirebaseName');
var chalk = require('chalk');
var FirebaseError = require('../lib/error');

module.exports = new Command('collab:invite <email>')
  .description('invite a collaborator to the current app')
  .option('-f, --firebase <app>', 'override the app specified in firebase.json')
  .before(requireAuth)
  .action(function(email, options) {
    var firebase = getFirebaseName(options);

    return api.request('POST', '/firebase/' + firebase + '/invite', {
      email: email
    }, true).then(function(res) {
      if (res.body.error) {
        return RSVP.reject(new FirebaseError(res.body.error, {exit: 1}));
      }
      logger.info(chalk.bold(email), 'has been invited to join', firebase);
      return RSVP.resolve();
    });
  });
