'use strict';

var Command = require('../lib/command');
var requireAuth = require('../lib/requireAuth');
var acquireRefs = require('../lib/acquireRefs');
var logger = require('../lib/logger');
var api = require('../lib/api');
var loadConfig = require('../lib/loadConfig');
var loadRules = require('../lib/loadRules');
var getFirebaseName = require('../lib/getFirebaseName');
var validator = require('../lib/validator').firebase;
var chalk = require('chalk');
var prepareUpload = require('../lib/prepareUpload');
var ProgressBar = require('progress');
var RSVP = require('rsvp');
var FirebaseError = require('../lib/error');
var utils = require('../lib/utils');

module.exports = new Command('deploy')
  .description('deploy the current app')
  .option('-f, --firebase <app>', 'override the app specified in firebase.json')
  .option('-m, --message <message>', 'an optional message describing this deploy')
  .before(requireAuth)
  .before(acquireRefs)
  .action(function(options) {
    var firebase = getFirebaseName(options);
    var payload = {};
    var versionRef = options.firebaseRef.child('hosting/versions').child(firebase).push();
    var versionId = versionRef.key();
    var bar;
    var config = loadConfig(options);
    config.firebase = firebase;

    logger.info('Validating local configuration...');
    logger.info();

    return validator.validate(config).then(function() {
      utils.logSuccess('firebase.json is valid');
      payload.config = config;
    }).then(function() {
      var rules = loadRules(options);
      if (rules) {
        utils.logSuccess('rules.json is valid');
        payload.rules = rules;
      }
    }).then(function() {
      logger.info();
      logger.info('Preparing public directory for upload...');
      logger.info();

      return prepareUpload(options, config);
    }).then(function(upload) {
      payload.hosting = {
        version: versionId,
        prefix: versionId + '/',
        manifest: upload.manifest.map(function(file) {
          return {path: file, object: file};
        })
      };

      return new RSVP.Promise(function(resolve, reject) {
        var lastCount = 0;

        bar = new ProgressBar(chalk.bold('Uploading:') + ' [:bar] :percent', {
          total: upload.manifest.length,
          width: 40,
          complete: chalk.green('='),
          incomplete: ' ',
          clear: true
        });

        versionRef.on('value', function(snap) {
          var status = snap.child('status').val();
          switch (status) {
          case 'deploying':
            var uc = snap.child('uploadedCount').val() || 0;
            bar.tick(uc - lastCount);
            lastCount = uc;
            break;
          case 'deployed':
            utils.logSuccess('Files uploaded successfully');
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

        api.request('PUT', '/firebase/' + firebase + '/uploads/' + versionId, {
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
    }).then(function() {
      versionRef.off('value');
      bar.terminate();

      return api.request('PUT', '/firebase/' + firebase + '/release', {
        data: payload,
        auth: true,
        origin: api.uploadOrigin
      });
    }).then(function(res) {
      utils.logSuccess('Deploy complete!');
      logger.info();
      logger.info(chalk.bold('URL:'), utils.addSubdomain(api.hostingOrigin, firebase));
      logger.info(chalk.bold('Dashboard:'), utils.addSubdomain(api.realtimeOrigin, firebase) + '/?page=Hosting');
      logger.info();
      logger.info('Visit the URL above or run', chalk.bold('firebase open'));
      return res.body;
    });
    // Step 1: Validate the config and rules.json
    // Step 2: Create tarball and file manifest
    // Step 3: Upload tarball to hosting upload endpoint
    // Step 4: Create release on Firebase Admin
  });
