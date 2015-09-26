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
var chalk = require('chalk');
var logger = require('../lib/logger');
var fs = require('fs');

module.exports = new Command('data:update <path>')
  .description('update some of the keys for the defined path in your Firebase')
  .option('-f, --firebase <app>', 'override the app specified in firebase.json')
  .option('-a, --auth <token>', 'authorization token to use (defaults to admin token)')
  .option('-i, --input <filename>', 'read data from the specified file')
  .before(requireAccess)
  .action(function(path, options) {
    var firebase = getFirebaseName(options);

    return new RSVP.Promise(function(resolve, reject) {
      var fileIn = !!options.input;
      var inStream = fileIn ? fs.createReadStream(options.input) : process.stdin;

      var url = utils.addSubdomain(api.realtimeOrigin, firebase) + path + '.json?';
      var query = {auth: options.auth || options.dataToken};

      url += querystring.stringify(query);

      inStream.pipe(request.patch(url, {json: true}, function(err, res, body) {
        logger.info();
        if (err) {
          return reject(new FirebaseError('Unexpected error while setting data', {exit: 2}));
        } else if (res.statusCode >= 400) {
          return reject(responseToError(res, body));
        }

        utils.logSuccess('Data updated successfully');
        logger.info();
        logger.info(chalk.bold('View data at:'), utils.addSubdomain(api.realtimeOrigin, firebase) + path);
        return resolve();
      }));
    });
  });
