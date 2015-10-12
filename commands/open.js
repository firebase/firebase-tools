'use strict';

var Command = require('../lib/command');
var getFirebaseName = require('../lib/getFirebaseName');
var logger = require('../lib/logger');
var open = require('open');
var chalk = require('chalk');
var RSVP = require('rsvp');
var api = require('../lib/api');
var utils = require('../lib/utils');

var PANELS = {
  dashboard: '/',
  data: '/',
  rules: '/?page=Security',
  simulator: '/?page=Simulator',
  analytics: '/?page=Analytics',
  auth: '/?page=Auth',
  hosting: '/?page=Hosting'
};

module.exports = new Command('open [panel]')
  .description('open Firebase Hosting URL in browser or jump to a dashboard panel')
  .option('-f, --firebase <app>', 'override the app specified in firebase.json')
  .action(function(panel, options) {
    var firebase = getFirebaseName(options);
    var url;

    if (panel && PANELS[panel]) {
      var dashOrigin = utils.addSubdomain(api.realtimeOrigin, firebase);
      url = dashOrigin + PANELS[panel];
    } else if (!panel || panel === 'site') {
      url = utils.addSubdomain(api.hostingOrigin, firebase);
    } else {
      return utils.reject('Unrecognized panel, must be one of: ' + Object.keys(PANELS).join(', '), {exit: 1});
    }

    logger.info('Opening URL in your default browser:');
    logger.info(chalk.bold.underline(url));
    open(url);
    return RSVP.resolve(url);
  });
