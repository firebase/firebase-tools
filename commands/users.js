'use strict';

var Command = require('../lib/command');
var requireDataAccess = require('../lib/requireDataAccess');
var request = require('request');
var api = require('../lib/api');
var responseToError = require('../lib/responseToError');
var FirebaseError = require('../lib/error');
var RSVP = require('rsvp');
var querystring = require('querystring');
var fs = require('fs');

module.exports = new Command('users')
  .description('fetch and print users')
  .option('-f, --firebase <app>', 'override the app specified in firebase.json')
  .option('-o, --output <filename>', 'save output to the specified file')
  // TODO: Do we need to require data access?
  .before(requireDataAccess)
  .action(function(options) {
    return new RSVP.Promise(function(resolve, reject) {
      var fileOut = !!options.output;
      var outStream = fileOut ? fs.createWriteStream(options.output) : process.stdout;
      var erroring;
      var errorResponse = '';
      var response;

      var url = api.authOrigin + '/v2/' + options.firebase + '/users?';

      var query = {token: options.session.token};

      url += querystring.stringify(query);

      request.get(url)
        .on('response', function(res) {
          response = res;
          if (response.statusCode >= 400) {
            erroring = true;
          }
        })
        .on('data', function(chunk) {
          if (erroring) {
            errorResponse += chunk;
          } else {
            outStream.write(chunk);
          }
        })
        .on('end', function() {
          if (erroring) {
            try {
              var data = JSON.parse(errorResponse);
              return reject(responseToError(response, data));
            } catch (e) {
              return reject(new FirebaseError('Malformed JSON response', {
                exit: 2,
                original: e
              }));
            }
          }
          return resolve();
        })
        .on('error', reject);
    });
  });
