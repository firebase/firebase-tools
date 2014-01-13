var bitballoon = require('bitballoon'),
    auth = require('./auth'),
    path = require('path');

module.exports = {
  deploy: function(settings, callback) {
    var bbClient = bitballoon.createClient({ access_token: settings.bbToken });
    if (path.relative('.', settings['public']).match(/^\./)) {
      prompt.logger.error('PUBLIC DIRECTORY ERROR - Public directory must' +
                            ' be within current working directory');
      return;
    }
    var publicDir = path.resolve(settings['public']);
    if (typeof(settings.bbSite) === 'undefined') {
      bbClient.createSite({ dir: publicDir }, function(err, site) {
        if (err) {
          setTimeout(callback, 0, err);
        } else {
          site.waitForReady(function(err, site) {
            auth.updateBitBalloonSiteId(settings.firebase, site.id, callback);
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
                var site = site.url || null;
                if (site) {
                  site = site.replace(/^http:/, 'https:');
                }
                setTimeout(callback, 0, err, site);
              });
            }
          });
        }
      });
    }
  }
};
