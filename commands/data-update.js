'use strict';

var Command = require('../lib/command');
var requireDataAccess = require('../lib/requireDataAccess');
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
var prompt = require('../lib/prompt');
var _ = require('lodash');

module.exports = new Command('data:update <path> [infile]')
  .description('update some of the keys for the defined path in your Firebase')
  .option('-f, --firebase <app>', 'override the app specified in firebase.json')
  .option('-d, --data <data>', 'specify escaped JSON directly')
  .option('-y, --confirm', 'pass this option to bypass confirmation prompt')
  .before(requireDataAccess)
  .action(function(path, infile, options) {
    if (!_.startsWith(path, '/')) {
      return utils.reject('Path must begin with /', {exit: 1});
    }

    return prompt(options, [{
      type: 'confirm',
      name: 'confirm',
      default: false,
      message: 'You are about to modify data at ' + chalk.cyan(path) + ' on ' + chalk.cyan(options.firebase) + '. Are you sure?'
    }]).then(function() {
      if (!options.confirm) {
        return utils.reject('Command aborted.', {exit: 1});
      }

      return new RSVP.Promise(function(resolve, reject) {
        var inStream = utils.stringToStream(options.data) || (infile ? fs.createReadStream(infile) : process.stdin);

        var url = utils.addSubdomain(api.realtimeOrigin, options.firebase) + path + '.json?';
        var query = {auth: options.dataToken};

        url += querystring.stringify(query);

        if (!infile && !options.data) {
          utils.explainStdin();
        }

        inStream.pipe(request.patch(url, {json: true}, function(err, res, body) {
          logger.info();
          if (err) {
            return reject(new FirebaseError('Unexpected error while setting data', {exit: 2}));
          } else if (res.statusCode >= 400) {
            return reject(responseToError(res, body));
          }

          utils.logSuccess('Data updated successfully');
          logger.info();
          logger.info(chalk.bold('View data at:'), utils.addSubdomain(api.realtimeOrigin, options.firebase) + path);
          return resolve();
        }));
      });
    });
  });
