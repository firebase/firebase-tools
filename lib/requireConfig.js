'use strict';

var RSVP = require('rsvp');
var FirebaseError = require('./error');

module.exports = function(options) {
  if (options.config) {
    return RSVP.resolve();
  }
  return RSVP.reject(
    options.configError ||
    new FirebaseError('Not in a Firebase project directory (could not locate firebase.json)', {exit: 1})
  );
};
