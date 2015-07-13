'use strict';

var Command = require('../lib/command');
var logger = require('../lib/logger');
var CLIENT_ID = '566423900627-4iagaob7shrd6ibfc6lr95vojv8c2eu4.apps.googleusercontent.com';

module.exports = new Command('login')
  .description('sign in to your Google account')
  .action(function(options, resolve) {
    logger.info('https://accounts.google.com/o/oauth2/auth?response_type=code&client_id=' + CLIENT_ID + '&redirect_uri=urn:ietf:wg:oauth:2.0:oob&include_granted_scopes=true&scope=profile');
    resolve();
  });
