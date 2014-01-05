var bitballoon = require('bitballoon'),
    Api = require('./api'),
    Auth = require('./auth'),
    path = require('path');

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
    var bbAuth = this._getToken(false, function(err, token) {
      if (err) {
        setTimeout(callback, 0, err);
        return;
      }
      var bbClient = bitballoon.createClient({ access_token: token });
      var publicDir = path.resolve(settings['public']);
      if (typeof(settings.bbSite) === 'undefined') {
        bbClient.createSite({ dir: publicDir }, function(err, site) {
          if (err) {
            setTimeout(callback, 0, err);
          } else {
            Auth.updateBitBalloonSiteId(settings.firebase, site.id, function(err) {
              if (err) {
                setTimeout(callback, 0, err);
              } else {
                site.waitForReady(callback);
              }
            });
          }
        });
      } else {
        bbClient.site(settings.bbSite, function(err, site) {
          if (err) {
            setTimeout(callback, 0, err);
          } else {
            site.update({ dir: publicDir }, function(err, site) {
              if (err) {
                setTimeout(callback, 0, err);
              } else {
                site.waitForReady(callback);
              }
            });
          }
        });
      }
    });
  }
};

function initBitBalloon() {
}

initBitBalloon();

module.exports = BitBalloon;
