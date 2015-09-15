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

var _logSuccess = function(message) {
  logger.info(chalk.green('✔ '), message);
};

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

    return validator.validate(config).then(function() {
      _logSuccess('firebase.json is valid');
      payload.config = config;
    }).then(function() {
      var rules = loadRules(options);
      if (rules) {
        _logSuccess('rules.json is valid');
        payload.rules = rules;
      }
    }).then(function() {
      logger.info();
      logger.info('Preparing public directory for upload...');

      return prepareUpload(options, config);
    }).then(function(upload) {
      payload.hosting = {
        version: versionId,
        prefix: versionId + '/',
        manifest: upload.manifest.map(function(file) {
          return {path: file, object: file};
        })
      };

      bar = new ProgressBar(chalk.bold('Uploading:') + ' [:bar] :percent', {
        total: upload.manifest.length,
        width: 40,
        complete: chalk.green('='),
        incomplete: ' ',
        clear: true
      });

      var lastCount = 0;
      versionRef.on('value', function(snap) {
        var uc = snap.child('uploadedCount').val() || 0;
        bar.tick(uc - lastCount);
        lastCount = uc;
      });

      return api.request('PUT', '/firebase/' + firebase + '/uploads/' + versionId, {
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
      logger.info(res.body);
      return res.body;
    });
    // Step 1: Validate the config and rules.json
    // Step 2: Create tarball and file manifest
    // Step 3: Upload tarball to hosting upload endpoint
    // Step 4: Create release on Firebase Admin
  });
