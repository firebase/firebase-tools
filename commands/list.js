'use strict';

var Command = require('../lib/command');
var api = require('../lib/api');
var requireAuth = require('../lib/requireAuth');
var logList = require('../lib/logList');

module.exports = new Command('list')
  .description('list the Firebases to which you have access')
  .before(requireAuth)
  .action(function(options, resolve, reject) {
    api.request('GET', '/account', {}, true, function(statusCode, response) {
      if (response.firebases) {
        var list = Object.keys(response.firebases).sort();
        logList('info', 'Firebases for your account', list);
        resolve(response.firebases);
      } else {
        reject('uh oh');
      }
    });
  });
