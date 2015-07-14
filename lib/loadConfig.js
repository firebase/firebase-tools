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

  throw new FirebaseError('Could not find ' + CONFIG_FILENAME + ' in ' + (pd || cwd || process.cwd()), {status: 404});
};
