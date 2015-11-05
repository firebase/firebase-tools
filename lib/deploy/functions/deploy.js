'use strict';

var _ = require('lodash');
var api = require('../../api');
var archiver = require('archiver');
var chalk = require('chalk');
var filesize = require('filesize');
var FirebaseError = require('../../error');
var fs = require('fs');
var path = require('path');
var RSVP = require('rsvp');
var tmp = require('tmp');
var utils = require('../../utils');

tmp.setGracefulCleanup();

module.exports = function(context, options, payload) {
  var functionsConfig = options.config.get('functions');

  function _packageSource() {
    return new RSVP.Promise(function(resolve, reject){
      var sourceDir = options.config.path(functionsConfig['.source']);

      var tmpFile = tmp.fileSync({prefix: 'firebase-functions-', postfix: '.zip'});

      var fileStream = fs.createWriteStream(tmpFile.name, {
        flags: 'w',
        defaultEncoding: 'binary'
      });

      var archive = archiver('zip');
      fileStream.on('finish', function () {
        utils.logBullet('packaged ' + chalk.bold(functionsConfig['.source']) + ' (' + filesize(archive.pointer()) + ') for uploading');
        resolve({
          file: tmpFile.name,
          stream: fs.createReadStream(tmpFile.name),
          size: archive.pointer()
        });
      });

      archive.on('error', function(err){
        reject(new FirebaseError('Could not read source directory. Remove links and shortcuts and try again.', {
          original: err,
          exit: 1
        }));
      });
      archive.pipe(fileStream);
      archive
        .directory(sourceDir, false)
        .finalize();
    });
  }

  function _uploadSource(source) {
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
  }

  if (options.config.get('functions')) {
    utils.logBullet('preparing ' + chalk.bold(payload.functions['.source']) + ' directory for uploading...');
    return _packageSource().then(_uploadSource).then(function() {
      utils.logSuccess(functionsConfig['.source'] + ' folder uploaded successfully');
    });
  }

  return RSVP.resolve();
};
