'use strict';

var Command = require('../lib/command');
var requireAccess = require('../lib/requireAccess');
var api = require('../lib/api');
var FirebaseError = require('../lib/error');
var RSVP = require('rsvp');
var utils = require('../lib/utils');
var chalk = require('chalk');
var logger = require('../lib/logger');
var fs = require('fs');
var prompt = require('../lib/prompt');
var _ = require('lodash');
var readJSONInput = require('../lib/readJSONInput');

module.exports = new Command('database:set <path> [infile]')
  .description('store JSON data at the specified path via STDIN, arg, or file')
  .option('-d, --data <data>', 'specify escaped JSON directly')
  .option('-y, --confirm', 'pass this option to bypass confirmation prompt')
  .before(requireAccess)
  .action(function(path, infile, options) {
    if (!_.startsWith(path, '/')) {
      return utils.reject('Path must begin with /', {exit: 1});
    }

    return prompt(options, [{
      type: 'confirm',
      name: 'confirm',
      default: false,
      message: 'You are about to overwrite all data at ' + chalk.cyan(utils.addSubdomain(api.realtimeOrigin, options.instance) + path) + '. Are you sure?'
    }]).then(function() {
      if (!options.confirm) {
        return utils.reject('Command aborted.', {exit: 1});
      }

      var inStream = utils.stringToStream(options.data) || (infile ? fs.createReadStream(infile) : process.stdin);
      var url = utils.addSubdomain(api.realtimeOrigin, options.instance) + path + '.json?';

      if (!infile && !options.data) {
        utils.explainStdin();
      }

      return readJSONInput(inStream)
      .then(function(input) {
        return api.request('PUT', url, {
          auth: true,
          data: input,
          origin: ''
        });
      }).then(function() {
        logger.info();
        utils.logSuccess('Data persisted successfully');
        logger.info();
        logger.info(chalk.bold('View data at:'), utils.consoleUrl(options.project, '/database/data' + path));
        return RSVP.resolve();
      }).catch(function(err) {
        return RSVP.reject(new FirebaseError('Error while setting data. ' + err.message, {exit: 2}));
      });
    });
  });
