'use strict';

var RSVP = require('rsvp');
var google = require('googleapis');

module.exports = {
  createClient: function(accessToken) {
    return new RSVP.Promise(function(resolve) {
      var oauth2Client = new google.auth.OAuth2(/* not needed, since we have access_token */);
      oauth2Client.setCredentials({
        access_token: accessToken
      });
      return resolve(oauth2Client);
    });
  },
  cloudlogging: require('./cloudlogging')
};
