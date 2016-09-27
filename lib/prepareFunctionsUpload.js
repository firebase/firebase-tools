'use strict';

var tmp = require('tmp');
var fs = require('fs-extra');
var RSVP = require('rsvp');
var path = require('path');
var fsutils = require('./fsutils');
var utils = require('./utils');
var _ = require('lodash');
var chalk = require('chalk');
var archiver = require('archiver');
var filesize = require('filesize');
var FirebaseError = require('./error');
var fstreamIgnore = require('fstream-ignore');
var api = require('./api');
var logger = require('./logger');
var resolveProjectPath = require('./resolveProjectPath');
var fork = require('child_process').fork;

var ENV_SRC_FILE = 'env.json';
var ENV_DEST_FILE = 'env.json';

var _prepareSource = function(options) {
  var tmpdir = tmp.dirSync({prefix: 'fbfn_'});
  try {
    fs.copySync(options.config.path(options.config.get('functions.source')), tmpdir.name);
  } catch (err) {
    throw new FirebaseError('Problem preparing functions directory for upload.', {exit: 1});
  }

  var envPath = resolveProjectPath(options.cwd, ENV_SRC_FILE);
  var envDestPath = path.join(tmpdir.name, ENV_DEST_FILE);
  var env = {};

  if (fsutils.fileExistsSync(envPath)) {
    var existing = fs.readFileSync(envPath, 'utf8');
    try {
      env = JSON.parse(existing);
    } catch (err) {
      logger.debug(err);
      throw new FirebaseError(ENV_SRC_FILE + ' could not be parsed', {exit: 1});
    }
  }

  _.assign(env, {
    firebase: {
      database: {
        url: utils.addSubdomain(api.realtimeOrigin, options.instance)
      }
    }
  });

  fs.ensureFileSync(envDestPath);
  fs.writeFileSync(envDestPath, JSON.stringify(env, null, 2));
  return tmpdir;
};

var TRIGGER_PARSER = path.resolve(__dirname, './triggerParser.js');
var _parseTriggers = function(options, tmpdir) {
  return new RSVP.Promise(function(resolve, reject) {
    var parser = fork(TRIGGER_PARSER, [tmpdir.name], {silent: true});

    parser.on('message', function(message) {
      if (message.triggers) {
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
    reader.addIgnoreRules(['!' + ENV_SRC_FILE]);

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

module.exports = function(options) {
  var tmpdir = _prepareSource(options);
  return _parseTriggers(options, tmpdir).then(function(triggers) {
   // respect any manually defined triggers in firebase.json
    options.config.set('functions.triggers',
      options.config.get('functions.triggers', []).concat(triggers)
    );

    if (options.config.get('functions.triggers').length === 0) {
      return RSVP.resolve(null);
    }

    return _packageSource(options, tmpdir);
  });
};
