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

var _prepareSource = function(options) {
  var tmpdir = tmp.dirSync({prefix: 'fbfn_'});
  try {
    fs.copySync(options.config.path(options.config.get(['functions', '.source'])), tmpdir.name);
  } catch (err) {
    return utils.reject('Problem preparing functions directory for upload.', {code: 1, original: err});
  }

  var envPath = path.join(tmpdir.name, '.env.json');
  var env = {};

  if (fsutils.fileExistsSync(envPath)) {
    var existing = fs.readFileSync(envPath, 'utf8');
    try {
      env = JSON.parse(existing);
    } catch (err) {
      return utils.reject('.env.json could not be parsed', {code: 1});
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
    fs.writeFileSync(envPath, JSON.stringify(env, null, 2));
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
    // We want to always upload .env.json regardless of ignore rules
    reader.addIgnoreRules(['!.env.json']);

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
