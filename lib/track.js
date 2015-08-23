'use strict';

var ua = require('universal-analytics');
var _ = require('lodash');
var RSVP = require('rsvp');

var auth = require('./auth');
var configstore = require('./configstore');
var pkg = require('../package.json');

var accountId;
if (auth.token) {
  accountId = _.first(auth.token.split('|'));
}

var visitor = ua(process.env.FIREBASE_ANALYTICS_UA || 'UA-66650807-2', accountId, {
  strictCidFormat: false,
  https: true
});

module.exports = function(action, label, duration) {
  return new RSVP.Promise(function(resolve) {
    if (accountId && configstore.get('collectUsage')) {
      visitor.event('Firebase CLI ' + pkg.version, action, label, duration).send(function() {
        // we could handle errors here, but we won't
        resolve();
      });
    } else {
      resolve();
    }
  });
};
