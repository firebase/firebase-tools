'use strict';

var path = require('path');
var FirebaseError = require('./error');
var detectProjectRoot = require('./detectProjectRoot');

var CONFIG_FILENAME = 'firebase.json';

module.exports = function(cwd) {
  /* istanbul ignore next */
  var pd = detectProjectRoot(cwd);
  if (pd) {
    return require(path.join(pd, CONFIG_FILENAME));
  }

  throw new FirebaseError('Not in a Firebase app directory (could not locate firebase.json)', {status: 404, exit: 1});
};
