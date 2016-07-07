'use strict';

var Command = require('../lib/command');
var requireAccess = require('../lib/requireAccess');
var api = require('../lib/api');
var FirebaseError = require('../lib/error');
var RSVP = require('rsvp');
var utils = require('../lib/utils');
var prompt = require('../lib/prompt');
var chalk = require('chalk');
var _ = require('lodash');

module.exports = new Command('database:remove <path>')
  .description('remove data from your Firebase at the specified path')
  .option('-y, --confirm', 'pass this option to bypass confirmation prompt')
  .before(requireAccess)
  .action(function(path, options) {
    if (!_.startsWith(path, '/')) {
      return utils.reject('Path must begin with /', {exit: 1});
    }

    return prompt(options, [{
      type: 'confirm',
      name: 'confirm',
      default: false,
      message: 'You are about to remove all data at ' + chalk.cyan(utils.addSubdomain(api.realtimeOrigin, options.instance) + path) + '. Are you sure?'
    }]).then(function() {
      if (!options.confirm) {
        return utils.reject('Command aborted.', {exit: 1});
      }

      return new RSVP.Promise(function(resolve, reject) {
        var url = utils.addSubdomain(api.realtimeOrigin, options.instance) + path + '.json?';
        api.request('DELETE', url, {
          auth: true,
          origin: ''
        }).then(function() {
          utils.logSuccess('Data removed successfully');
          return resolve();
        }).catch(function(err) {
          return reject(new FirebaseError('Unexpected error while removing data. ' + err.message, {exit: 2}));
        });
      });
    });
  });
