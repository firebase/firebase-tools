'use strict';

var FirebaseError = require('./error');

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
  if (!options.project && !allowNull) {
    throw new FirebaseError('No project specified. Run with --project or inside project directory', {
      exit: 1
    });
  }
  return options.project;
};
