'use strict';

var Command = require('../lib/command');
var api = require('../lib/api');
var requireAuth = require('../lib/requireAuth');
var logList = require('../lib/logList');
var FirebaseError = require('../lib/error');
var chalk = require('chalk');

module.exports = new Command('list')
  .description('list the Firebases to which you have access')
  .before(requireAuth)
  .action(function(options, resolve, reject) {
    api.getFirebases().then(function(firebases) {
      var list = Object.keys(firebases).sort();
      logList('info', 'Firebases for your account', list, chalk.yellow);
      resolve(firebases);
    }, reject);
  });
