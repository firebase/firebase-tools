'use strict';

var Command = require('../lib/command');
var requireAccess = require('../lib/requireAccess');
var getFirebaseName = require('../lib/getFirebaseName');
var request = require('request');
var api = require('../lib/api');
var responseToError = require('../lib/responseToError');
var FirebaseError = require('../lib/error');
var RSVP = require('rsvp');
var utils = require('../lib/utils');
var querystring = require('querystring');

module.exports = new Command('data:remove <path>')
  .description('remove data from your Firebase at the specified path')
  .option('-f, --firebase <app>', 'override the app specified in firebase.json')
  .option('-a, --auth <token>', 'authorization token to use (defaults to admin token)')
  .before(requireAccess)
  .action(function(path, options) {
    var firebase = getFirebaseName(options);

    return new RSVP.Promise(function(resolve, reject) {
      var url = utils.addSubdomain(api.realtimeOrigin, firebase) + path + '.json?';
      var query = {auth: options.auth || options.dataToken};

      url += querystring.stringify(query);

      request.del(url, {json: true}, function(err, res, body) {
        if (err) {
          return reject(new FirebaseError('Unexpected error while removing data', {exit: 2}));
        } else if (res.statusCode >= 400) {
          return reject(responseToError(res, body));
        }

        utils.logSuccess('Data removed successfully');
        return resolve();
      });
    });
  });
