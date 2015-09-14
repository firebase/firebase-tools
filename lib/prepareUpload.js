'use strict';

var fstreamIgnore = require('fstream-ignore');
var resolveProjectPath = require('./resolveProjectPath');
var path = require('path');
var FirebaseError = require('./error');
var tarPack = require('tar').Pack;
var zlib = require('zlib');
var tmp = require('tmp');
var fs = require('fs');
var RSVP = require('rsvp');

tmp.setGracefulCleanup();

module.exports = function(options, config) {
  return new RSVP.Promise(function(resolve, reject) {
    var publicDir = resolveProjectPath(options.cwd, config.public);
    var indexPath = resolveProjectPath(options.cwd, path.join(config.public, 'index.html'));
    var manifest = [];
    var foundIndex = false;

    var zipStream = zlib.createGzip();
    var tmpFile = tmp.fileSync({prefix: 'firebase-upload-', postfix: '.tar.gz'});

    var fileStream = fs.createWriteStream(tmpFile.name, {
      flags: 'w',
      defaultEncoding: 'binary'
    });

    fileStream.on('finish', function() {
      var stats = fs.statSync(tmpFile.name);

      resolve({
        file: tmpFile.name,
        stream: fs.createReadStream(tmpFile.name),
        manifest: manifest,
        foundIndex: foundIndex,
        size: stats.size
      });
    });

    var reader = fstreamIgnore({
      path: publicDir,
      type: 'Directory',
      follow: true,
      filter: function() {
        if (this.type !== 'Directory') {
          manifest.push(path.relative(publicDir, this.path));
        }
        if (this.path === indexPath) {
          foundIndex = true;
        }
        return true;
      }
    });

    reader.addIgnoreRules(config.ignore || []);

    reader.on('error', function(err) {
      reject(new FirebaseError('Could not read public directory. Remove links and shortcuts and try again.', {
        original: err,
        exit: 1
      }));
    });

    reader.pipe(tarPack()).pipe(zipStream).pipe(fileStream);
  });
};
