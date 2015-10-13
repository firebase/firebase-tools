'use strict';

var ua = require('universal-analytics');
var RSVP = require('rsvp');

var configstore = require('./configstore');
var pkg = require('../package.json');
var uuid = require('node-uuid');

var anonId = configstore.get('analytics-uuid');
if (!anonId) {
  anonId = uuid.v4();
  configstore.set('analytics-uuid', anonId);
}

var visitor = ua(process.env.FIREBASE_ANALYTICS_UA || 'UA-29174744-3', anonId, {
  strictCidFormat: false,
  https: true
});

module.exports = function(action, label, duration) {
  return new RSVP.Promise(function(resolve) {
    if (configstore.get('session') && configstore.get('usage')) {
      visitor.event('Firebase CLI ' + pkg.version, action, label, duration).send(function() {
        // we could handle errors here, but we won't
        resolve();
      });
    } else {
      resolve();
    }
  });
};
