'use strict';

var _ = require('lodash');
var archiver = require('archiver');
var chalk = require('chalk');
var filesize = require('filesize');
var fs = require('fs-extra');
var fork = require('child_process').fork;
var path = require('path');
var RSVP = require('rsvp');
var tmp = require('tmp');

var FirebaseError = require('./error');
var functionsConfig = require('./functionsConfig');
var getProjectId = require('./getProjectId');
var logger = require('./logger');
var track = require('./track');
var utils = require('./utils');
var fstreamIgnore = require('fstream-ignore');

var CONFIG_DEST_FILE = '.runtimeconfig.json';

var _prepareSource = function(context, options) {
  var tmpdir = tmp.dirSync({prefix: 'fbfn_'});
  var configDest = path.join(tmpdir.name, CONFIG_DEST_FILE);
  try {
    fs.copySync(options.config.path(options.config.get('functions.source')), tmpdir.name);
  } catch (err) {
    throw new FirebaseError('Problem preparing functions directory for upload.', {exit: 1});
  }
  return functionsConfig.materializeAll(getProjectId(options)).then(function(output) {
    var firebaseConfig = _.get(context, 'firebaseConfig');
    _.set(output, 'firebase', firebaseConfig);
    fs.ensureFileSync(configDest);
    fs.writeFileSync(configDest, JSON.stringify(output, null, 2));
    logger.debug('> [functions] runtime config materialized as:', JSON.stringify(output, null, 2));
    return tmpdir;
  });
};

var TRIGGER_PARSER = path.resolve(__dirname, './triggerParser.js');
var _parseTriggers = function(options, tmpdir) {
  return new RSVP.Promise(function(resolve, reject) {
    var env = {
      GCLOUD_PROJECT: getProjectId(options),
      DB_NAMESPACE: options.instance
    };
    var parser = fork(TRIGGER_PARSER, [tmpdir.name], {silent: true, env: env});

    parser.on('message', function(message) {
      if (message.triggers) {
        logger.debug('> [functions] parsed triggers:', JSON.stringify(message.triggers, null, 2));
        track('Functions Deploy (Count)', '', message.triggers.length);
        resolve(message.triggers);
      } else if (message.error) {
        reject(new FirebaseError(message.error, {exit: 1}));
      }
    });

    parser.on('exit', function(code) {
      if (code !== 0) {
        reject(new FirebaseError('There was an unknown problem while trying to parse function triggers.', {exit: 2}));
      }
    });
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
    reader.addIgnoreRules(options.config.get(['functions', '.ignore'], ['**/.*', '**/node_modules/**']));
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
      fs.removeSync(tmpdir.name);
    });
  });
};

module.exports = function(context, options) {
  var tmpdir;
  return _prepareSource(context, options).then(function(result) {
    tmpdir = result;
    return _parseTriggers(options, tmpdir);
  }).then(function(triggers) {
    options.config.set('functions.triggers', triggers);
    if (options.config.get('functions.triggers').length === 0) {
      return RSVP.resolve(null);
    }
    return _packageSource(options, tmpdir);
  });
};
