'use strict';

var Config = require('./config');
var FirebaseError = require('./error');
var logger = require('./logger');

/**
 * Tries to determine the correct app name for commands that
 * only require an app name. Uses passed in firebase option
 * first, then falls back to firebase.json.
 * @param {Object} options The command-line options object
 * @param {boolean} allowNull Whether or not the firebase flag
 * is required
 * @returns {String} The firebase name
 */
module.exports = function(options, allowNull) {
  if (options.firebase) {
    return options.firebase.toLowerCase();
  }
  try {
    var config = options.config || Config.load(options, true);
    if (config && config.defaults.project) {
      return config.defaults.project.toLowerCase();
    }
  } catch (e) {
    logger.debug('Config.load Error: ' + e.stack);
  }

  if (!allowNull) {
    throw new FirebaseError('No app specified. Run with -f or inside app directory', {
      exit: 1
    });
  }
};
