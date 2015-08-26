'use strict';

var Command = require('../lib/command');
var requireAuth = require('../lib/requireAuth');
var logger = require('../lib/logger');
var api = require('../lib/api');
var getFirebaseName = require('../lib/getFirebaseName');
var chalk = require('chalk');
var prompt = require('../lib/prompt');
var _ = require('lodash');

module.exports = new Command('collab:remove [email]')
  .description('remove a collaborator from the current app')
  .option('-f, --firebase <app>', 'override the app specified in firebase.json')
  .before(requireAuth)
  .action(function(email, options) {
    var firebase = getFirebaseName(options);
    options.email = email;

    return api.request('GET', '/firebase/' + firebase + '/users', {}, true).then(function(res) {
      return prompt(options, [
        {
          type: 'list',
          name: 'email',
          message: 'Which collaborator do you want to remove?',
          choices: _.pluck(_.values(res.body), 'email')
        }
      ]);
    }).then(function() {
      return api.request('DELETE', '/firebase/' + firebase + '/users', {
        id: options.email
      }, true).then(function() {
        logger.info(chalk.bold(options.email), 'has been removed from', firebase);
        return true;
      });
    });
  });
