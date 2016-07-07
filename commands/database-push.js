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
var Firebase = require('firebase');
var _ = require('lodash');
var readJSONInput = require('../lib/readJSONInput');

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

    return readJSONInput(inStream)
    .then(function(input) {
      return api.request('POST', url, {
        auth: true,
        data: input,
        origin: ''
      });
    }).then(function(resp) {
      if (!_.endsWith(path, '/')) {
        path += '/';
      }

      var consoleUrl = utils.consoleUrl(options.project, '/database/data' + path + resp.body.name);
      var refurl = utils.addSubdomain(api.realtimeOrigin, options.instance) + path + resp.body.name;

      utils.logSuccess('Data pushed successfully');
      logger.info();
      logger.info(chalk.bold('View data at:'), consoleUrl);
      return RSVP.resolve(new Firebase(refurl));
    }).catch(function(err) {
      return RSVP.reject(new FirebaseError('Error while pushing data. ' + err.message, {exit: 2}));
    });
  });

