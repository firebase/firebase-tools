'use strict';

var Command = require('../lib/command');
var requireAuth = require('../lib/requireAuth');
var logger = require('../lib/logger');
var api = require('../lib/api');
var getFirebaseName = require('../lib/getFirebaseName');
var chalk = require('chalk');

module.exports = new Command('collab:invite <email>')
  .description('invite a collaborator to the current app')
  .option('-f, --firebase <app>', 'override the app specified in firebase.json')
  .before(requireAuth)
  .action(function(email, options) {
    var firebase = getFirebaseName(options);

    return api.request('POST', '/firebase/' + firebase + '/invite', {
      email: email
    }, true).then(function() {
      logger.info(chalk.bold(email), 'has been invited to join', firebase);
      return;
    });
  });
