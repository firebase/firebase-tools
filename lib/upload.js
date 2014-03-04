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
  deploy: function(firebase, publicDir, callback) {
    var writeStream = temp.createWriteStream({ suffix: '.tar.gz' }),
        filename = writeStream.path;

    fstream.Reader({
        path: publicDir,
        type: 'Directory'
      })
      .pipe(tar.Pack())
      .pipe(zlib.createGzip())
      .pipe(writeStream);

    writeStream.once('finish', function() {
      var url = api.uploadUrl + '/upload/' + firebase + '?token=' + auth.token
      var r = request.put(url, function(err, response, body) {
        fs.unlink(filename);
        setTimeout(callback, 0, err, api.hostingUrl.replace(/\/\//, '//' + firebase + '.'));
      });
      var form = r.form();
      form.append('site', fs.createReadStream(filename));
    });
  }
}
