'use strict';

var Command = require('../lib/command');
var requireDatabaseAccess = require('../lib/requireDatabaseAccess');
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

module.exports = new Command('database:update <path> [infile]')
  .description('update some of the keys for the defined path in your Firebase')
  .option('-d, --data <data>', 'specify escaped JSON directly')
  .option('-y, --confirm', 'pass this option to bypass confirmation prompt')
  .before(requireDatabaseAccess)
  .action(function(path, infile, options) {
    if (!_.startsWith(path, '/')) {
      return utils.reject('Path must begin with /', {exit: 1});
    }

    return prompt(options, [{
      type: 'confirm',
      name: 'confirm',
      default: false,
      message: 'You are about to modify data at ' + chalk.cyan(utils.addSubdomain(api.realtimeOrigin, options.instance) + path) + '. Are you sure?'
    }]).then(function() {
      if (!options.confirm) {
        return utils.reject('Command aborted.', {exit: 1});
      }

      return new RSVP.Promise(function(resolve, reject) {
        var inStream = utils.stringToStream(options.data) || (infile ? fs.createReadStream(infile) : process.stdin);

        var url = utils.addSubdomain(api.realtimeOrigin, options.instance) + path + '.json?';
        var query = {auth: options.databaseAdminToken};

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
          logger.info(chalk.bold('View data at:'), utils.consoleUrl(options.project, '/database/data' + path));
          return resolve();
        }));
      });
    });
  });
