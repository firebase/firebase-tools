'use strict';

var _ = require('lodash');
var RSVP = require('rsvp');
var resolveProjectPath = require('../../resolveProjectPath');
var fs = require('fs');
var utils = require('../../utils');

module.exports = function(context, options, payload) {
  context.hosting = {
    versionRef: options.firebaseRef.child('hosting/versions').child(context.firebase).push()
  };
  context.hosting.versionId = context.hosting.versionRef.key();

  // Allow the public directory to be overridden by the --public flag
  if (options.public) {
    // trigger legacy key import since public may not exist in firebase.json
    options.config.importLegacyKeys();
    options.config.set('hosting.public', options.public);
  }

  payload.hosting = options.config.get('hosting');

  if (payload.hosting) {
    if (!_.has(payload, 'hosting.public')) {
      return utils.reject('No public directory specified, can\'t deploy hosting', {exit: 1});
    } else if (!fs.existsSync(resolveProjectPath(options.cwd, payload.hosting.public))) {
      return utils.reject('Specified public directory does not exist, can\'t deploy hosting', {exit: 1});
    }
  }

  return RSVP.resolve();
};
