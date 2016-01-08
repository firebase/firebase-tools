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

var ENV_SRC_FILE = 'env.json';
var ENV_DEST_FILE = 'env.js';
var ENV_TEMPLATE = fs.readFileSync(__dirname + '/../templates/env.js', 'utf8');

var _prepareSource = function(options) {
  var tmpdir = tmp.dirSync({prefix: 'fbfn_'});
  try {
    fs.copySync(options.config.path(options.config.get(['functions', '.source'])), tmpdir.name);
  } catch (err) {
    return utils.reject('Problem preparing functions directory for upload.', {code: 1, original: err});
  }

  var envPath = path.join(tmpdir.name, ENV_SRC_FILE);
  var envDestPath = path.join(tmpdir.name, ENV_DEST_FILE);
  var env = {};

  if (fsutils.fileExistsSync(envPath)) {
    var existing = fs.readFileSync(envPath, 'utf8');
    try {
      env = JSON.parse(existing);
      // remove env.json, we're generating env.js
      fs.unlinkSync(envPath);
    } catch (err) {
      logger.debug(err);
      return utils.reject(ENV_SRC_FILE + ' could not be parsed', {code: 1});
    }
  }

  return api.getSecret(options.project, options.databaseAdminToken).then(function(secret) {
    _.assign(env, {
      firebase: {
        database: {
          url: utils.addSubdomain(api.realtimeOrigin, options.project),
          secret: secret
        }
      }
    });

    var template = ENV_TEMPLATE.replace('{/* ENV */}', JSON.stringify(env));
    fs.writeFileSync(envDestPath, template);
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
      utils.logBullet('packaged ' + chalk.bold(options.config.get(['functions', '.source'])) + ' (' + filesize(archive.pointer()) + ') for uploading');
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
        archive.append(file, { name: path.relative(sourceDir, file.path) });
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
    });
  });
};

module.exports = function(options) {
  return _prepareSource(options).then(function(tmpdir) {
    return _packageSource(options, tmpdir);
  });
};
