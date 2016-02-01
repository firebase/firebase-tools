'use strict';

var api = require('../../api');
var chalk = require('chalk');
var RSVP = require('rsvp');
var tmp = require('tmp');
var utils = require('../../utils');
var prepareFunctionsUpload = require('../../prepareFunctionsUpload');
tmp.setGracefulCleanup();

module.exports = function(context, options, payload) {
  var functionsConfig = options.config.get('functions');

  var _uploadSource = function(source) {
    var versionId = options.firebaseRef.push().key();
    return api.request('PUT', '/projects/' + context.projectId + '/functions/uploads/' + versionId, {
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
    utils.logBullet('preparing ' + chalk.bold(options.config.get(['functions', '.source'], 'functions')) + ' directory for uploading...');
    return prepareFunctionsUpload(options).then(_uploadSource).then(function() {
      utils.logSuccess(functionsConfig['.source'] + ' folder uploaded successfully');
    });
  }

  return RSVP.resolve();
};
