'use strict';

var _ = require('lodash');
var archiver = require('archiver');
var chalk = require('chalk');
var filesize = require('filesize');
var fs = require('fs-extra');
var fstreamIgnore = require('fstream-ignore');
var path = require('path');
var RSVP = require('rsvp');
var tmp = require('tmp');

var FirebaseError = require('./error');
var functionsConfig = require('./functionsConfig');
var getProjectId = require('./getProjectId');
var logger = require('./logger');
var utils = require('./utils');
var parseTriggers = require('./parseTriggers');

var CONFIG_DEST_FILE = '.runtimeconfig.json';

var _getFunctionsConfig = function(context) {
  var next = RSVP.resolve({});
  if (context.runtimeConfigEnabled) {
    next = functionsConfig.materializeAll(context.firebaseConfig.projectId).catch(function(err) {
      logger.debug(err);
      var errorCode = _.get(err, 'context.response.statusCode');
      if (errorCode === 500 || errorCode === 503) {
        throw new FirebaseError('Cloud Runtime Config is currently experiencing issues, ' +
          'which is preventing your functions from being deployed. ' +
          'Please wait a few minutes and then try to deploy your functions again.' +
          '\nRun `firebase deploy --except functions` if you want to continue deploying the rest of your project.');
      }
    });
  }

  return next.then(function(config) {
    var firebaseConfig = _.get(context, 'firebaseConfig');
    _.set(config, 'firebase', firebaseConfig);
    return config;
  });
};

var _packageSource = function(options, sourceDir, configValues) {
  return new RSVP.Promise(function(resolve, reject) {
    var tmpFile = tmp.fileSync({prefix: 'firebase-functions-', postfix: '.zip'});

    var fileStream = fs.createWriteStream(tmpFile.name, {
      flags: 'w',
      defaultEncoding: 'binary'
    });

    var archive = archiver('zip');
    fileStream.on('finish', function() {
      utils.logBullet(chalk.cyan.bold('functions:') + ' packaged ' + chalk.bold(options.config.get('functions.source')) + ' (' + filesize(archive.pointer()) + ') for uploading');
      resolve({
        file: tmpFile.name,
        stream: fs.createReadStream(tmpFile.name),
        size: archive.pointer()
      });
    });

    archive.on('error', function(err) {
      reject(new FirebaseError('Could not read source directory. Remove links and shortcuts and try again.', {
        original: err,
        exit: 1
      }));
    });
    archive.pipe(fileStream);
    var reader = fstreamIgnore({
      path: sourceDir,
      type: 'Directory',
      follow: true
    });

    // We must ignore firebase-debug.log or weird things happen if
    // you're in the public dir when you deploy.
    // We ignore any CONFIG_DEST_FILE that already exists, and write another one
    // with current config values into the archive in the "end" handler for reader
    reader.addIgnoreRules(['firebase-debug.log', CONFIG_DEST_FILE]);
    reader.addIgnoreRules(options.config.get('functions.ignore', ['**/node_modules/**']));

    reader.on('child', function(file) {
      if (file.type !== 'Directory') {
        archive.append(file, { name: path.relative(sourceDir, file.path), mode: file.props.mode });
      }
    });

    reader.on('error', function(err) {
      reject(new FirebaseError('Could not read source directory. Remove links and shortcuts and try again.', {
        original: err,
        exit: 1
      }));
    });

    reader.on('end', function() {
      archive.append(JSON.stringify(configValues), { name: CONFIG_DEST_FILE });
      archive.finalize();
    });
  });
};

module.exports = function(context, options) {
  var configValues;
  var sourceDir = options.config.path(options.config.get('functions.source'));
  return _getFunctionsConfig(context).then(function(result) {
    configValues = result;
    return parseTriggers(getProjectId(options), sourceDir, configValues);
  }).then(function(triggers) {
    options.config.set('functions.triggers', triggers);
    if (options.config.get('functions.triggers').length === 0) {
      return RSVP.resolve(null);
    }
    return _packageSource(options, sourceDir, configValues);
  });
};
