'use strict';

var Command = require('../lib/command');
var requireAccess = require('../lib/requireAccess');
var request = require('request');
var api = require('../lib/api');
var responseToError = require('../lib/responseToError');
var FirebaseError = require('../lib/error');
var RSVP = require('rsvp');
var utils = require('../lib/utils');
var chalk = require('chalk');
var logger = require('../lib/logger');
var fs = require('fs');
var Firebase = require('firebase');
var _ = require('lodash');

module.exports = new Command('database:push <path> [infile]')
  .description('add a new JSON object to a list of data in your Firebase')
  .option('-d, --data <data>', 'specify escaped JSON directly')
  .before(requireAccess)
  .action(function(path, infile, options) {
    if (!_.startsWith(path, '/')) {
      return utils.reject('Path must begin with /', {exit: 1});
    }

    var inStream = utils.stringToStream(options.data) || (infile ? fs.createReadStream(infile) : process.stdin);
    var url = utils.addSubdomain(api.realtimeOrigin, options.instance) + path + '.json?';

    if (!infile && !options.data) {
      utils.explainStdin();
    }

    var reqOptions = {
      url: url,
      json: true
    };

    return api.addRequestHeaders(reqOptions).then(function(reqOptionsWithToken) {
      return new RSVP.Promise(function(resolve, reject) {
        inStream.pipe(request.post(reqOptionsWithToken, function(err, res, body) {
          logger.info();
          if (err) {
            return reject(new FirebaseError('Unexpected error while pushing data', {exit: 2}));
          } else if (res.statusCode >= 400) {
            return reject(responseToError(res, body));
          }

          if (!_.endsWith(path, '/')) {
            path += '/';
          }

          var consoleUrl = utils.consoleUrl(options.project, '/database/data' + path + body.name);
          var refurl = utils.addSubdomain(api.realtimeOrigin, options.instance) + path + body.name;

          utils.logSuccess('Data pushed successfully');
          logger.info();
          logger.info(chalk.bold('View data at:'), consoleUrl);
          return resolve(new Firebase(refurl));
        }));
      });
    });
  });

