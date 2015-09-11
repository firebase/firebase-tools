'use strict';

var Command = require('../lib/command');
var requireAuth = require('../lib/requireAuth');
var logger = require('../lib/logger');
var api = require('../lib/api');
var FirebaseError = require('../lib/error');
var RSVP = require('rsvp');
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

    return api.request('GET', '/firebase/' + firebase + '/users', {auth: true}).then(function(res) {
      return prompt(options, [
        {
          type: 'list',
          name: 'email',
          message: 'Which collaborator do you want to remove?',
          choices: ['[ Cancel ]'].concat(_.pluck(_.values(res.body), 'email'))
        }
      ]);
    }).then(function() {
      if (options.email === '[ Cancel ]') {
        return RSVP.reject(new FirebaseError('Aborted Collaborator Removal', {exit: 1}));
      }

      return api.request('DELETE', '/firebase/' + firebase + '/users', {
        auth: true,
        data: {id: options.email}
      }).then(function() {
        logger.info(chalk.bold(options.email), 'has been removed from', firebase);
        return true;
      });
    });
  });
