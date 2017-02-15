'use strict';

var chalk = require('chalk');
var RSVP = require('rsvp');
var tmp = require('tmp');
var utils = require('../../utils');
var gcp = require('../../gcp');
var prepareFunctionsUpload = require('../../prepareFunctionsUpload');

tmp.setGracefulCleanup();

module.exports = function(context, options, payload) {
  var _uploadSource = function(source) {
    return gcp.storage.buckets.acquire(context.projectId, context.functionsBucket)
    .then(function(bucketName) {
      return gcp.storage.upload(source.stream, bucketName);
    });
  };
  if (options.config.get('functions')) {
    utils.logBullet(chalk.cyan.bold('functions:') + ' preparing ' + chalk.bold(options.config.get('functions.source')) + ' directory for uploading...');

    return prepareFunctionsUpload(context, options).then(function(result) {
      payload.functions = {
        triggers: options.config.get('functions.triggers')
      };

      if (!result) {
        return undefined;
      }
      return _uploadSource(result).then(function() {
        utils.logSuccess(chalk.green.bold('functions:') + ' ' + chalk.bold(options.config.get('functions.source')) + ' folder uploaded successfully');
      }).catch(function(err) {
        utils.logWarning(chalk.yellow('functions:') + ' Upload Error: ' + err.message);
      });
    });
  }
  return RSVP.resolve();
};
