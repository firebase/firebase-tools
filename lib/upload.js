var request = require('request'),
    auth = require('./auth'),
    api = require('./api');

module.exports = {
  deploy: function(firebase, publicDir, callback) {
    callback && callback(null, 'https://www.google.com');
  }
}
