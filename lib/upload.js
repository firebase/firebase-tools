var request = require('request'),
    auth = require('./auth'),
    api = require('./api'),
    fstreamIgnore = require('fstream-ignore'),
    tar = require('tar'),
    zlib = require('zlib'),
    fs = require('fs'),
    path = require('path'),
    chalk = require('chalk'),
    stream = require('stream');

module.exports = {
  send: function(firebase, publicDir, ignoreRules, pushId, message, callback) {
    var fileCount = 0,
        tarballSize = 0,
        foundIndex = false,
        zipStream = zlib.createGzip(),
        bufferStream = new stream.Transform(),
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
      bufferStream.push(chunk);
      tarballSize += chunk.length;
    });

    zipStream.on('end', function() {
      bufferStream.end();
      if (fileCount === 0) {
        console.log(chalk.yellow('Public Directory Warning') + ' - Public ' +
                        'directory is empty, removing site');
      } else if (!foundIndex) {
        console.log(chalk.yellow('Public Directory Warning') + ' - Public ' +
                        'directory does not contain an index.html\n' +
                        'Make sure you\'re deploying the right public directory: ' +
                        chalk.bold(path.resolve(publicDir)));
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
