'use strict';

var RSVP = require('rsvp');
var prepareUpload = require('../../prepareUpload');
var utils = require('../../utils');
var chalk = require('chalk');
var ProgressBar = require('progress');
var api = require('../../api');

module.exports = function(context, options, payload) {
  var local = context.hosting;

  utils.logBullet('preparing ' + chalk.bold(payload.config.public) + ' directory for upload...');
  return prepareUpload(options, payload.config).then(function(upload) {
    if (!upload.manifest.length) {
      return utils.reject('Must have at least one file in public directory to deploy.', {exit: 1});
    }

    payload.hosting = {
      version: local.versionId,
      prefix: local.versionId + '/',
      manifest: upload.manifest.map(function(file) {
        return {path: file, object: file};
      })
    };

    return new RSVP.Promise(function(resolve, reject) {
      var lastCount = 0;

      var bar = new ProgressBar(chalk.bold('Uploading:') + ' [:bar] :percent', {
        total: upload.manifest.length,
        width: 40,
        complete: chalk.green('='),
        incomplete: ' ',
        clear: true
      });

      local.versionRef.on('value', function(snap) {
        var status = snap.child('status').val();
        switch (status) {
        case 'deploying':
          var uc = snap.child('uploadedCount').val() || 0;
          bar.tick(uc - lastCount);
          lastCount = uc;
          break;
        case 'deployed':
          utils.logSuccess(upload.manifest.length + ' files uploaded successfully');
          bar.terminate();
          local.versionRef.off('value');
          resolve();
          break;
        case 'removed':
          reject(new FirebaseError('Not Implemented', {
            exit: 2,
            context: snap.val()
          }));
          break;
        case null:
          break;
        default:
          var msg = 'File upload failed';
          if (snap.hasChild('statusMessage')) {
            msg += ': ' + snap.child('statusMessage').val();
          }

          reject(new FirebaseError(msg, {
            exit: 2,
            context: snap.val()
          }));
        }
      });

      api.request('PUT', '/firebase/' + context.firebase + '/uploads/' + local.versionId, {
        auth: true,
        query: {
          fileCount: upload.manifest.length,
          message: options.message
        },
        files: {
          site: {
            filename: 'site.tar.gz',
            stream: upload.stream,
            contentType: 'application/x-gzip',
            knownLength: upload.size
          }
        },
        origin: api.uploadOrigin
      }).catch(reject);
    });
  });
};
