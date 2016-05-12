'use strict';

var RSVP = require('rsvp');
var prepareUpload = require('../../prepareUpload');
var utils = require('../../utils');
var chalk = require('chalk');
var ProgressBar = require('progress');
var api = require('../../api');
var _ = require('lodash');
var FirebaseError = require('../../error');

module.exports = function(context, options, payload) {
  var local = context.hosting;

  if (!payload.hosting) {
    return RSVP.resolve();
  }

  utils.logBullet(chalk.cyan.bold('hosting:') + ' preparing ' + chalk.bold(payload.hosting.public) + ' directory for upload...');
  return prepareUpload(options, payload.hosting).then(function(upload) {
    if (!upload.foundIndex) {
      utils.logWarning(chalk.bold('Warning:') + ' Public directory does not contain index.html');
    }

    if (!upload.manifest.length) {
      return utils.reject('Must have at least one file in public directory to deploy.', {exit: 1});
    }

    _.assign(payload.hosting, {
      version: local.versionId,
      prefix: local.versionId + '/',
      manifest: upload.manifest.map(function(file) {
        return {path: file, object: file};
      })
    });

    return new RSVP.Promise(function(resolve, reject) {
      var lastCount = 0;
      var lastPercent = 0;
      var bar;
      if (!options.nonInteractive && process.stderr) {
        bar = new ProgressBar(chalk.bold('Uploading:') + ' [:bar] :percent', {
          total: upload.manifest.length,
          width: 40,
          complete: chalk.green('='),
          incomplete: ' ',
          clear: true
        });
      } else {
        process.stdout.write(chalk.cyan.bold('\ni') + chalk.bold('  Progress: ['));
      }

      local.versionRef.on('value', function(snap) {
        var status = snap.child('status').val();
        switch (status) {
        case 'deploying':
          var uc = snap.child('uploadedCount').val() || 0;
          var percent = Math.round(100.0 * uc / upload.manifest.length);
          if (bar) {
            bar.tick(uc - lastCount);
          } else {
            process.stdout.write(_.repeat(chalk.green('.'), percent - lastPercent));
            lastPercent = percent;
          }
          lastCount = uc;
          break;
        case 'deployed':
          if (bar) {
            bar.terminate();
          } else {
            process.stdout.write(chalk.bold(']') + '\n\n');
          }
          utils.logSuccess(chalk.green.bold('hosting:') + ' ' + upload.manifest.length + ' files uploaded successfully');
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

      api.request('PUT', '/v1/hosting/' + options.instance + '/uploads/' + local.versionId, {
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
        origin: api.deployOrigin
      }).catch(reject);
    });
  });
};
