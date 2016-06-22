'use strict';

var api = require('../../api');
var chalk = require('chalk');
var RSVP = require('rsvp');
var tmp = require('tmp');
var utils = require('../../utils');
var prepareFunctionsUpload = require('../../prepareFunctionsUpload');

tmp.setGracefulCleanup();

module.exports = function(context, options, payload) {
  var _uploadSource = function(source) {
    var versionId = options.firebaseRef.push().key();
    return api.request('PUT', '/v1/projects/' + encodeURIComponent(context.projectId) + '/functions/uploads/' + versionId, {
      auth: true,
      files: {
        code: {
          filename: 'source.zip',
          stream: source.stream,
          contentType: 'application/zip',
          knownLength: source.size
        }
      },
      origin: api.deployOrigin
    });
  };

  if (options.config.get('functions')) {
    utils.logBullet(chalk.cyan.bold('functions:') + ' preparing ' + chalk.bold(options.config.get('functions.source')) + ' directory for uploading...');

    return prepareFunctionsUpload(options).then(function(result) {
      payload.functions = {
        triggers: options.config.get('functions.triggers')
      };

      if (!result) {
        utils.logWarning(chalk.cyan.bold('functions:') + ' no triggers defined, skipping deploy.');
        return undefined;
      }
      return _uploadSource(result).then(function() {
        utils.logSuccess(chalk.green.bold('functions:') + ' ' + chalk.bold(options.config.get('functions.source')) + ' folder uploaded successfully');
      });
    });
  }

  return RSVP.resolve();
};
