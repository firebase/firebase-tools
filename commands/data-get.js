'use strict';

var Command = require('../lib/command');
var requireAccess = require('../lib/requireAccess');
var request = require('request');
var api = require('../lib/api');
var responseToError = require('../lib/responseToError');
var FirebaseError = require('../lib/error');
var RSVP = require('rsvp');
var utils = require('../lib/utils');
var querystring = require('querystring');
var _ = require('lodash');
var fs = require('fs');

var _applyStringOpts = function(dest, src, keys, jsonKeys) {
  _.forEach(keys, function(key) {
    if (src[key]) {
      dest[key] = src[key];
    }
  });

  // some keys need JSON encoding of the querystring value
  _.forEach(jsonKeys, function(key) {
    if (src[key]) {
      dest[key] = JSON.stringify(src[key]);
    }
  });
};

module.exports = new Command('data:get <path>')
  .description('fetch and print JSON data at the specified path')
  .option('-f, --firebase <app>', 'override the app specified in firebase.json')
  .option('-a, --auth <token>', 'authorization token to use (defaults to admin token)')
  .option('-o, --output <filename>', 'save output to the specified file')
  .option('--pretty', 'pretty print response')
  .option('--shallow', 'return shallow response')
  .option('--export', 'include priorities in the output response')
  .option('--order-by <key>', 'select a child key by which to order results')
  .option('--order-by-key', 'order by key name')
  .option('--order-by-value', 'order by primitive value')
  .option('--limit-to-first <num>', 'limit to the first <num> results')
  .option('--limit-to-last <num>', 'limit to the last <num> results')
  .option('--start-at <val>', 'limit to the first <num> results')
  .option('--end-at <val>', 'limit to the last <num> results')
  .option('--equal-to <val>', 'use with --order-by to restrict to specific value')
  .before(requireAccess)
  .action(function(path, options) {
    return new RSVP.Promise(function(resolve, reject) {
      var fileOut = !!options.output;
      var outStream = fileOut ? fs.createWriteStream(options.output) : process.stdout;
      var erroring;
      var errorResponse = '';
      var response;

      var url = utils.addSubdomain(api.realtimeOrigin, options.firebase) + path + '.json?';
      var query = {auth: options.auth || options.dataToken};
      if (options.shallow) { query.shallow = 'true'; }
      if (options.pretty) { query.print = 'pretty'; }
      if (options.export) { query.format = 'export'; }
      if (options.orderByKey) { options.orderBy = '$key'; }
      if (options.orderByValue) { options.orderBy = '$value'; }
      _applyStringOpts(query, options, ['limitToFirst', 'limitToLast'], ['orderBy', 'startAt', 'endAt', 'equalTo']);

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
