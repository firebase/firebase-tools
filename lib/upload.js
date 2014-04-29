var request = require('request'),
    auth = require('./auth'),
    api = require('./api'),
    fstream = require('fstream'),
    tar = require('tar'),
    zlib = require('zlib'),
    temp = require('temp'),
    fs = require('fs'),
    ProgressBar = require('progress');

temp.track();

module.exports = {
  send: function(firebase, publicDir, callback) {
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
      var url = api.uploadUrl + '/upload/' + firebase + '?token=' + auth.token
      var readStream = fs.createReadStream(filename);
      var bar = null;
      var r = request.put({
        url: url,
        json: true
      }, function(err, response, body) {
        fs.unlink(filename);
        var failed = (err || !(body.success || body.accepted));
        if (bar && failed) {
          bar.terminate();
        }
        setTimeout(callback, 0, failed, body ? body.directory : undefined);
      });
      var form = r.form();
      form.append('fileCount', fileCount);
      form.append('site', readStream);
      bar = new ProgressBar('  uploading  [:bar] :percent :etas', {
        complete: '=',
        incomplete: ' ',
        width: Math.max(process.stdout.columns - 30, 20),
        total: fileCount.toString().length +
               form._overheadLength +
               form._boundary.length +
               form._valueLength +
               writeStream.bytesWritten + 3
      });
      form.on('data', function(chunk) {
        bar.tick(chunk.length);
      });
    });
  }
}
