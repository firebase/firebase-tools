'use strict';

var Command = require('../lib/command');
var getFirebaseName = require('../lib/getFirebaseName');
var logger = require('../lib/logger');
var open = require('open');
var chalk = require('chalk');
var RSVP = require('rsvp');

module.exports = new Command('open')
  .description('open the URL of the current Firebase app in a browser')
  .option('-f, --firebase <app>', 'override the app specified in firebase.json')
  .action(function(options) {
    var firebase = getFirebaseName(options);

    var url = 'https://' + firebase + '.firebaseapp.com/';
    logger.info('Opening URL in your default browser:');
    logger.info(chalk.bold.underline(url));
    open(url);
    return RSVP.resolve(url);
  });
