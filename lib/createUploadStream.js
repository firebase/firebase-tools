'use strict';

var fstreamIgnore = require('fstream-ignore');
var resolveProjectPath = require('./resolveProjectPath');
var path = require('path');
var FirebaseError = require('./error');
var tarPack = require('tar').Pack;
var zlib = require('zlib');
var through = require('through');

module.exports = function(options, config) {
  var publicDir = resolveProjectPath(options.cwd, config.public);
  var indexPath = resolveProjectPath(options.cwd, path.join(config.public, 'index.html'));

  var zipStream = zlib.createGzip();
  var outStream = through(function(data) {
    this.queue(data);
  });
  outStream.manifest = [];
  outStream.foundIndex = false;

  var reader = fstreamIgnore({
    path: publicDir,
    type: 'Directory',
    follow: true,
    filter: function() {
      if (this.type !== 'Directory') {
        outStream.manifest.push(path.relative(publicDir, this.path));
      }
      if (this.path === indexPath) {
        outStream.foundIndex = true;
      }
      return true;
    }
  });

  reader.addIgnoreRules(config.ignore || []);

  reader.on('error', function(err) {
    outStream.emit('error', new FirebaseError('Could not read public directory. Remove links and shortcuts and try again.', {
      original: err,
      exit: 1
    }));
  });

  return reader.pipe(tarPack()).pipe(zipStream).pipe(outStream);
};
