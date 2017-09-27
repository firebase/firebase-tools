'use strict';

var chalk = require('chalk');
var RSVP = require('rsvp');

var gcp = require('../../gcp');
var utils = require('../../utils');

var STORAGE_RELEASE_NAME = 'firebase.storage';

module.exports = function(context, options) {
  return RSVP.resolve();

  return gcp.rules.updateOrCreateRelease(
    options.project,
    context.storage.rulesetName,
    [STORAGE_RELEASE_NAME, context.storage.defaultBucket].join('/')
  ).then(function() {
    utils.logSuccess(chalk.bold.green('storage: ') + 'released rules for bucket ' + chalk.bold(context.storage.defaultBucket));
  });
};
