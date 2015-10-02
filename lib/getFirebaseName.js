'use strict';

var Config = require('./config');
var FirebaseError = require('./error');

/**
 * Tries to determine the correct app name for commands that
 * only require an app name. Uses passed in firebase option
 * first, then falls back to firebase.json.
 * @param {Object} options The command-line options object
 * @returns {String} The firebase name
 */
module.exports = function(options) {
  if (options.firebase) {
    return options.firebase;
  }
  var config = Config.load(options, true);
  if (config && config.defaults.app) {
    return config.defaults.app;
  }

  throw new FirebaseError('No app specified. Run with -f or inside app directory', {
    exit: 1
  });
};
