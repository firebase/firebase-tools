'use strict';

var _ = require('lodash');
var archiver = require('archiver');
var chalk = require('chalk');
var filesize = require('filesize');
var fs = require('fs-extra');
var fstreamIgnore = require('fstream-ignore');
var tar = require('tar-fs');
var gunzip = require('gunzip-maybe');
var path = require('path');
var request = require('request');
var tmp = require('tmp');
var RSVP = require('rsvp');

var api = require('../api');
var FirebaseError = require('../error');
var gcp = require('../gcp');
var utils = require('../utils');

var DEFAULT_REGION = gcp.cloudfunctions.DEFAULT_REGION;
var CONFIG_DEST_FILE = '.runtimeconfig.json';

function _retrieveFile(context) {
  var endpoint = '/repos/' + context.owner + '/' + context.repo + '/contents/' + context.path;
  return api.request('GET', endpoint, {
    auth: false,
    origin: 'https://api.github.com',
    headers: {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': context.repo + '-kitsIntaller'
    }
  }).then(function(result) {
    if (result.status !== 200) {
      return RSVP.reject(new FirebaseError(context.path + ' could not be retrieved for kit at ' + context.repo));
    }
    var buf = Buffer.from(result.body.content, 'base64');
    return RSVP.resolve(buf);
  }).catch(function(error) {
    return RSVP.reject(error);
  });
}

function _retrieveArchiveLink(tmpZip, context) {
  var archiveFormat = context.archive_format;
  var owner = context.owner;
  var repo = context.repo;
  var ref = context.ref;

  var endpoint = '/repos/' + owner + '/' + repo + '/' + archiveFormat + '/' + ref;
  return new RSVP.Promise(function(resolve, reject) {
    request({
      url: 'https://api.github.com' + endpoint,
      headers: {
        'Accept': 'application/vnd.github.v3.sha',
        'User-Agent': repo + '-kitsIntaller'
      }
    }).on('error', function(err) {
      utils.logWarning('There was an error with fetching the kit: ', err.message);
      reject(err);
    }).on('end', function() {
      utils.logSuccess(chalk.green.bold('kits: ') + 'Fetched kits source code.');
      resolve(tmpZip.name);
    }).pipe(gunzip())
      .pipe(tar.extract(tmpZip.name));
  }).then(function() {
    var subDirs = fs.readdirSync(tmpZip.name);
    if (!subDirs || subDirs.length === 0) {
      return new FirebaseError('Failed to fetch kits source code.');
    }
    return path.join(tmpZip.name, subDirs[0]);
  });
}

/**
 * Scaffolding code. Adapted from prepareFunctionsUpload.js
**/
var _packageSource = function(sourceDir, context, configValues) {
  return new RSVP.Promise(function(resolve, reject) {
    var tmpFile = tmp.fileSync({prefix: 'kits-upload-', postfix: '.zip'});
    var fileStream = fs.createWriteStream(tmpFile.name, {
      flags: 'w',
      defaultEncoding: 'binary'
    });

    var archive = archiver('zip');
    fileStream.on('finish', function() {
      utils.logBullet(chalk.cyan.bold('kits:') + ' packaged kit source (' + filesize(archive.pointer()) + ') for uploading');
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

    // We ignore any CONFIG_DEST_FILE that already exists, and write another one
    // with current config values into the archive in the "end" handler for reader
    reader.addIgnoreRules([context.path, CONFIG_DEST_FILE, '**/node_modules/**']);

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

function _uploadSourceCode(projectId, source) {
  var fullUrl;
  return gcp.cloudfunctions.generateUploadUrl(projectId, DEFAULT_REGION).then(function(uploadUrl) {
    fullUrl = uploadUrl;
    uploadUrl = _.replace(uploadUrl, 'https://storage.googleapis.com', '');
    return gcp.storage.upload(source, uploadUrl);
  }).then(function() {
    return fullUrl;
  });
}

function _upload(projectId, context, options) {
  var tmpZip = tmp.dirSync({prefix: 'kits-source-'});
  return _retrieveArchiveLink(tmpZip, context).then(function(sourceDir) {
    return _packageSource(sourceDir, context, options);
  }).then(function(source) {
    return _uploadSourceCode(projectId, source);
  });
}


module.exports = {
  retrieveFile: _retrieveFile,
  upload: _upload
};
