var request = require('request'),
    auth = require('./auth'),
    api = require('./api'),
    fstreamIgnore = require('fstream-ignore'),
    tar = require('tar'),
    zlib = require('zlib'),
    fs = require('fs'),
    path = require('path'),
    chalk = require('chalk'),
    util = require('util'),
    stream = require('stream'),
    filesize = require('filesize');

module.exports = {
  send: function(firebase, publicDir, ignoreRules, pushId, message, callback) {
    var fileCount = 0,
        buffers = [],
        tarballSize = 0,
        foundIndex = false,
        zipStream = zlib.createGzip(),
        indexPath = path.resolve(path.join(publicDir, 'index.html'));

    console.log('Preparing to deploy Public Directory...');

    var reader = fstreamIgnore({
        path: publicDir,
        type: 'Directory',
        follow: true,
        filter: function() {
          if (this.type !== 'Directory') {
            fileCount += 1;
          }
          if (this.path === indexPath) {
            foundIndex = true;
          }
          return true;
        }
      });

    reader.addIgnoreRules(ignoreRules);

    reader.on('error', function(err) {
      console.log(chalk.red('READ ERROR') + ' - Could not read directory. Remove' +
                          ' symbolic links / shortcuts and try again.');
      process.exit(1);
    });

    reader.pipe(tar.Pack())
      .pipe(zipStream);

    zipStream.on('data', function(chunk) {
      buffers.push(chunk);
      tarballSize += chunk.length;
    });

    zipStream.on('end', function() {
      var BufferStream = function(buffers, options) {
        this.buffers = buffers.reverse();

        stream.Readable.call(this, options);
      };

      util.inherits(BufferStream, stream.Readable);

      BufferStream.prototype._read = function() {
        // Populating this stream requires no I/O, given that all of the required data to stream is
        // already in memory. Due to a bug affecting Node v0.10 through v0.11.0, this synchronous
        // streaming has the potential to block the event loop and lead to a recursive nextTick()
        // call resulting in a crash. As a workaround, temporarily pause streaming periodically
        // so as to not plug the event queue.
        // See https://github.com/joyent/node/issues/6065
        if (this.buffers.length > 0) {
          this.push(this.buffers.pop());
        } else {
          this.push(null);
        }
        var self = this;
        self.pause();
        setTimeout(function() {
          self.resume();
        }, 0);
      };

      var bufferStream = new BufferStream(buffers);

      if (fileCount === 0) {
        console.log(chalk.yellow('Public Directory Warning') + ' - Public ' +
                        'directory is empty, removing site');
      } else if (!foundIndex) {
        console.log(chalk.yellow('Public Directory Warning') + ' - Public ' +
                        'directory does not contain an index.html\n' +
                        'Make sure you\'re deploying the right public directory: ' +
                        chalk.bold(path.resolve(publicDir)));
      } else if (fileCount > 500 || tarballSize > 100*1024*1024) {
        console.log(chalk.yellow('Public Directory Warning') + ' - Uploading ' +
                        fileCount + ' files with total compressed size = ' + filesize(tarballSize));
      } else {
        console.log('Uploading ' + fileCount + ' files with total compressed size = ' + filesize(tarballSize));
      }

      var params = ['id=' + encodeURIComponent(pushId), 'fileCount=' + fileCount, 'token=' + auth.token];
      if (message) {
        params.push('message=' + encodeURIComponent(message));
      }
      var url = api.uploadUrl + '/upload/' + firebase + '?' + params.join('&');

      var r = request.put({
        url: url,
        json: true
      }, function(err, response, body) {
        var failed = (err || !body || body.error);
        setTimeout(callback, 0, failed, body && body.directory);
      });
      var form = r.form();
      form.append('site', bufferStream, {
        filename: 'site.tar.gz',
        contentType: 'application/x-gzip',
        knownLength: tarballSize
      });
    });
  },
  deleteSite: function(firebase, pushId, message, callback) {
    var params = ['id=' + encodeURIComponent(pushId), 'token=' + auth.token];
    if (message) {
      params.push('message=' + encodeURIComponent(message));
    }
    var url = api.uploadUrl + '/upload/' + firebase + '?' + params.join('&');

    var r = request({
      url: url,
      method: 'DELETE',
      json: true
    }, function(err, response, body) {
      var failed = (err || !body || body.error);
      setTimeout(callback, 0, failed, body && body.directory);
    });
  }
};
