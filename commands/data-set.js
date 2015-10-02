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
var prompt = require('../lib/prompt');

module.exports = new Command('data:set <path>')
  .description('store JSON data at the specified path via STDIN, arg, or file')
  .option('-f, --firebase <app>', 'override the app specified in firebase.json')
  .option('-a, --auth <token>', 'authorization token to use (defaults to admin token)')
  .option('-i, --input <filename>', 'read data from the specified file')
  .option('-y, --confirm', 'pass this option to bypass confirmation prompt')
  .before(requireAccess)
  .action(function(path, options) {
    return prompt(options, [{
      type: 'confirm',
      name: 'confirm',
      default: false,
      message: 'You are about to overwrite all data at ' + chalk.cyan(path) + ' on ' + chalk.cyan(options.firebase) + '. Are you sure?'
    }]).then(function() {
      if (!options.confirm) {
        return utils.reject('Command aborted.', {exit: 1});
      }

      return new RSVP.Promise(function(resolve, reject) {
        var fileIn = !!options.input;
        var inStream = fileIn ? fs.createReadStream(options.input) : process.stdin;

        var url = utils.addSubdomain(api.realtimeOrigin, options.firebase) + path + '.json?';
        var query = {auth: options.auth || options.dataToken};

        url += querystring.stringify(query);

        utils.explainStdin();

        inStream.pipe(request.put(url, {json: true}, function(err, res, body) {
          logger.info();
          if (err) {
            return reject(new FirebaseError('Unexpected error while setting data', {exit: 2}));
          } else if (res.statusCode >= 400) {
            return reject(responseToError(res, body));
          }

          utils.logSuccess('Data persisted successfully');
          logger.info();
          logger.info(chalk.bold('View data at:'), utils.addSubdomain(api.realtimeOrigin, options.firebase) + path);
          return resolve();
        }));
      });
    });
  });
