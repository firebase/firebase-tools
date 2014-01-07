var bitballoon = require('bitballoon'),
    Api = require('./api'),
    Auth = require('./auth'),
    path = require('path');

var BitBalloon = {
  deploy: function(settings, callback) {
    var bbClient = bitballoon.createClient({ access_token: settings.bbToken });
    var publicDir = path.resolve(settings['public']);
    console.log('Uploading public directory');
    if (typeof(settings.bbSite) === 'undefined') {
      bbClient.createSite({ dir: publicDir }, function(err, site) {
        if (err) {
          setTimeout(callback, 0, err);
        } else {
          site.waitForReady(function(err, site) {
            Auth.updateBitBalloonSiteId(settings.firebase, site.id, callback);
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
              site.waitForReady(function(err, site) {
                setTimeout(callback, 0, err, site.url || null);
              });
            }
          });
        }
      });
    }
  }
};

function initBitBalloon() {
}

initBitBalloon();

module.exports = BitBalloon;
