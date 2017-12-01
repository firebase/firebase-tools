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

var _prepareSource = function(context, options) {
  var tmpdir = tmp.dirSync({prefix: 'fbfn_'});
  var configDest = path.join(tmpdir.name, CONFIG_DEST_FILE);
  try {
    fs.copySync(options.config.path(options.config.get('functions.source')), tmpdir.name);
  } catch (err) {
    logger.debug(err);
    throw new FirebaseError('Problem preparing functions directory for upload.', {exit: 1});
  }

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
    fs.ensureFileSync(configDest);
    fs.writeFileSync(configDest, JSON.stringify(config, null, 2));
    return tmpdir;
  });
};

var _packageSource = function(options, tmpdir) {
  var sourceDir = tmpdir.name;
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

    // we must ignore this or weird things happen if
    // you're in the public dir when you deploy
    reader.addIgnoreRules(['firebase-debug.log']);
    reader.addIgnoreRules(options.config.get('functions.ignore', ['**/node_modules/**']));
    // We want to always upload the env file regardless of ignore rules
    reader.addIgnoreRules(['!' + CONFIG_DEST_FILE]);

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
      archive.finalize();
      try {
        fs.removeSync(tmpdir.name);
      } catch (e) {
        utils.logWarning('Unable to delete temporary directory ' + tmpdir.name +
          '. You may want to manually delete it to save disk space.');
        logger.debug(e);
      }
    });
  });
};

module.exports = function(context, options) {
  var tmpdir;
  return _prepareSource(context, options).then(function(result) {
    tmpdir = result;

    return parseTriggers(getProjectId(options), tmpdir.name);
  }).then(function(triggers) {
    options.config.set('functions.triggers', triggers);
    if (options.config.get('functions.triggers').length === 0) {
      return RSVP.resolve(null);
    }
    return _packageSource(options, tmpdir);
  });
};
