var request = require('request'),
    auth = require('./auth'),
    api = require('./api'),
    fstream = require('fstream'),
    tar = require('tar'),
    zlib = require('zlib'),
    temp = require('temp'),
    fs = require('fs');

temp.track();

module.exports = {
  send: function(firebase, publicDir, pushId, message, callback) {
    var writeStream = temp.createWriteStream({ suffix: '.tar.gz' }),
        filename = writeStream.path,
        fileCount = 0;

    fstream.Reader({
        path: publicDir,
        type: 'Directory',
        follow: true,
        filter: function() {
          if (this.type !== 'Directory' && (
                this.basename.match(/^firebase\.json$/) ||
                this.basename.match(/^\./))) {
            return false;
          }
          if (this.type !== 'Directory') {
            fileCount += 1;
          }
          return true;
        }
      })
      .pipe(tar.Pack())
      .pipe(zlib.createGzip())
      .pipe(writeStream);

    writeStream.once('finish', function() {
      var params = ['id=' + encodeURIComponent(pushId), 'fileCount=' + fileCount, 'token=' + auth.token];
      if (message) {
        params.push('message=' + encodeURIComponent(message));
      }
      var url = api.uploadUrl + '/upload/' + firebase + '?' + params.join('&')
      var readStream = fs.createReadStream(filename);
      var r = request.put({
        url: url,
        json: true
      }, function(err, response, body) {
        fs.unlink(filename);
        var failed = (err || !(body.success || body.accepted));
        setTimeout(callback, 0, failed, body ? body.directory : undefined);
      });
      var form = r.form();
      form.append('site', readStream);
    });
  }
}
