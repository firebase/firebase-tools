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
var chalk = require('chalk');
var logger = require('../lib/logger');
var fs = require('fs');
var Firebase = require('firebase');

module.exports = new Command('data:push <path>')
  .description('add a new JSON object to a list of data in your Firebase')
  .option('-f, --firebase <app>', 'override the app specified in firebase.json')
  .option('-a, --auth <token>', 'authorization token to use (defaults to admin token)')
  .option('-i, --input <filename>', 'read data from the specified file')
  .before(requireAccess)
  .action(function(path, options) {
    return new RSVP.Promise(function(resolve, reject) {
      var fileIn = !!options.input;
      var inStream = fileIn ? fs.createReadStream(options.input) : process.stdin;

      var url = utils.addSubdomain(api.realtimeOrigin, options.firebase) + path + '.json?';
      var query = {auth: options.auth || options.dataToken};

      url += querystring.stringify(query);

      utils.explainStdin();

      inStream.pipe(request.post(url, {json: true}, function(err, res, body) {
        logger.info();
        if (err) {
          return reject(new FirebaseError('Unexpected error while pushing data', {exit: 2}));
        } else if (res.statusCode >= 400) {
          return reject(responseToError(res, body));
        }

        var refurl = utils.addSubdomain(api.realtimeOrigin, options.firebase) + path + '/' + body.name;

        utils.logSuccess('Data pushed successfully');
        logger.info();
        logger.info(chalk.bold('View data at:'), refurl);
        return resolve(new Firebase(refurl));
      }));
    });
  });
