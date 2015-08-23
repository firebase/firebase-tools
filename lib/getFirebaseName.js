'use strict';

var loadConfig = require('./loadConfig');
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
  var config = loadConfig({allowNull: true});
  if (config && config.firebase) {
    return config.firebase;
  }
  throw new FirebaseError('No firebase specified. Run with -f or inside app directory', {
    exit: 1
  });
};
