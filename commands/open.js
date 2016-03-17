'use strict';

var Command = require('../lib/command');
var requireAccess = require('../lib/requireAccess');
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
  .before(requireAccess)
  .action(function(panel, options) {
    var url;

    if (panel && PANELS[panel]) {
      // TODO: Change this to point to new console.
      var dashOrigin = utils.addSubdomain(api.realtimeOrigin, options.instance);
      url = dashOrigin + PANELS[panel];
    } else if (!panel || panel === 'site') {
      url = utils.addSubdomain(api.hostingOrigin, options.instance);
    } else {
      return utils.reject('Unrecognized panel, must be one of: ' + Object.keys(PANELS).join(', '), {exit: 1});
    }

    logger.info('Opening URL in your default browser:');
    logger.info(chalk.bold.underline(url));
    open(url);
    return RSVP.resolve(url);
  });
