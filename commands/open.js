'use strict';

var _ = require('lodash');
var chalk = require('chalk');
var open = require('open');
var RSVP = require('rsvp');

var api = require('../lib/api');
var Command = require('../lib/command');
var logger = require('../lib/logger');
var prompt = require('../lib/prompt');
var requireAccess = require('../lib/requireAccess');
var utils = require('../lib/utils');

var LINKS = [
  {name: 'Project Dashboard', arg: 'dashboard', consoleUrl: '/overview'},
  {name: 'Analytics', arg: 'analytics', consoleUrl: '/analytics'},
  {name: 'Database: Data', arg: 'database', consoleUrl: '/database/data'},
  {name: 'Database: Rules', arg: 'database:rules', consoleUrl: '/database/rules'},
  {name: 'Authentication: Providers', arg: 'auth', consoleUrl: '/authentication/providers'},
  {name: 'Authentication: Users', arg: 'auth:users', consoleUrl: '/authentication/users'},
  {name: 'Storage: Files', arg: 'storage', consoleUrl: '/storage/files'},
  {name: 'Storage: Rules', arg: 'storage:rules', consoleUrl: '/storage/rules'},
  {name: 'Hosting', arg: 'hosting', consoleUrl: '/hosting/main'},
  {name: 'Hosting: Deployed Site', arg: 'hosting:site'},
  {name: 'Remote Config', arg: 'config', consoleUrl: '/config'},
  {name: 'Remote Config: Conditions', arg: 'config:conditions', consoleUrl: '/config/conditions'},
  {name: 'Test Lab', arg: 'testlab', consoleUrl: '/testlab/histories/'},
  {name: 'Crash Reporting', arg: 'crash', consoleUrl: '/monitoring'},
  {name: 'Notifications', arg: 'notifications', consoleUrl: '/notification'},
  {name: 'Dynamic Links', arg: 'links', consoleUrl: '/durablelinks'},
  {name: 'Project Settings', arg: 'settings', consoleUrl: '/settings/general'},
  {name: 'Docs', arg: 'docs', url: 'https://firebase.google.com/docs'}
];

var CHOICES = _.map(LINKS, 'name');

module.exports = new Command('open [link]')
  .description('quickly open a browser to relevant project resources')
  .before(requireAccess)
  .action(function(linkName, options) {
    var link = _.find(LINKS, {arg: linkName});
    if (linkName && !link) {
      return utils.reject('Unrecognized link name. Valid links are:\n\n' + _.map(LINKS, 'arg').join('\n'));
    }

    var next = RSVP.resolve(link);
    if (!link) {
      next = prompt.once({
        type: 'list',
        message: 'What link would you like to open?',
        choices: CHOICES
      }).then(function(result) {
        return _.find(LINKS, {name: result});
      });
    }

    return next.then(function(finalLink) {
      var url;
      if (finalLink.consoleUrl) {
        url = utils.consoleUrl(options.project, finalLink.consoleUrl);
      } else if (finalLink.url) {
        url = finalLink.url;
      } else if (finalLink.arg === 'hosting:site') {
        url = utils.addSubdomain(api.hostingOrigin, options.instance);
      }

      logger.info(chalk.bold.cyan('Tip: ') + 'You can also run ' + chalk.bold.underline('firebase open ' + finalLink.arg));
      logger.info();
      logger.info('Opening ' + chalk.bold(finalLink.name) + ' link in your default browser:');
      logger.info(chalk.bold.underline(url));

      open(url);
      return RSVP.resolve(url);
    });
  });
