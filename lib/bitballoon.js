var bitballoon = require('bitballoon'),
    Api = require('./api'),
    Auth = require('./auth');

var BitBalloon = {
  maxRetries: 3,
  _getToken: function(forceRemote, callback) {
    var bbToken = Auth.bbToken;
    if (!forceRemote && (bbToken.length > 0)) {
      setTimeout(callback, 0, null, bbToken);
    } else {
      Api.request(
        'GET',
        '/account/bitballoon',
        {},
        true,
        function(statusCode, response) {
          if (typeof(response.token) === 'undefined') {
            setTimeout(callback, new Error('Could not get token'));
            return;
          }
          Auth.bbToken = response.token;
          Auth.saveConfig(function(err) {
            if (err) {
              setTimeout(callback, 0, err);
            } else {
              setTimeout(callback, 0, null, response.token);
            }
          });
        }
      );
    }
  },
  deploy: function(settings, callback) {
    setTimeout(callback, 0, null);
  }
};

function initBitBalloon() {
}

initBitBalloon();

module.exports = BitBalloon;
