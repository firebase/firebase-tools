'use strict';

var fstreamIgnore = require('fstream-ignore');
var path = require('path');
var FirebaseError = require('./error');
var tarPack = require('tar').Pack;
var zlib = require('zlib');
var tmp = require('tmp');
var fs = require('fs');
var RSVP = require('rsvp');

tmp.setGracefulCleanup();

module.exports = function(options) {
  var hostingConfig = options.config.get('hosting');
  return new RSVP.Promise(function(resolve, reject) {
    var publicDir = options.config.path(hostingConfig.public);
    var indexPath = path.join(publicDir, 'index.html');

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

    // we must ignore this or weird things happen if
    // you're in the public dir when you deploy
    reader.addIgnoreRules(['firebase-debug.log']);
    reader.addIgnoreRules(hostingConfig.ignore || []);

    reader.on('error', function(err) {
      reject(new FirebaseError('Could not read public directory. Remove links and shortcuts and try again.', {
        original: err,
        exit: 1
      }));
    });

    reader.pipe(tarPack()).pipe(zipStream).pipe(fileStream);
  });
};
