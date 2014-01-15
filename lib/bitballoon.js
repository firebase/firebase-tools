var bitballoon = require('bitballoon'),
    auth = require('./auth');

module.exports = {
  deploy: function(settings, callback) {
    var bbClient = bitballoon.createClient({ access_token: settings.bbToken });
    var publicDir = settings['public'];
    if (typeof(settings.bbSite) === 'undefined') {
      bbClient.createSite({ dir: publicDir }, function(err, site) {
        if (err) {
          setTimeout(callback, 0, err);
        } else {
          site.waitForReady(function(err, site) {
            if (err) {
              setTimeout(callback, 0, err);
            } else {
              auth.updateBitBalloonSiteId(settings.firebase, site.id, callback);
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
              site.waitForReady(function(err, site) {
                if (err) {
                  setTimeout(callback, 0, err);
                } else {
                  var site = site.url || null;
                  if (site) {
                    site = site.replace(/^http:/, 'https:');
                  }
                  setTimeout(callback, 0, err, site);
                }
              });
            }
          });
        }
      });
    }
  }
};
