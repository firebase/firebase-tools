'use strict';

var RSVP = require('rsvp');
var resolveProjectPath = require('../../resolveProjectPath');
var fs = require('fs');
var utils = require('../../utils');

module.exports = function(context, options, payload) {
  context.hosting = {
    versionRef: options.firebaseRef.child('hosting/versions').child(context.firebase).push()
  };
  context.hosting.versionId = context.hosting.versionRef.key();

  payload.hosting = options.config.get('hosting');
  if (!fs.existsSync(resolveProjectPath(options.cwd, payload.hosting.public))) {
    return utils.reject('No public directory specified, can\'t deploy hosting', {exit: 1});
  }
  return RSVP.resolve();
};
