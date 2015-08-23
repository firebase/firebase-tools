'use strict';

var path = require('path');
var FirebaseError = require('./error');
var detectProjectRoot = require('./detectProjectRoot');

var CONFIG_FILENAME = 'firebase.json';

module.exports = function(options) {
  options = options || {};
  /* istanbul ignore next */
  var pd = detectProjectRoot(options.cwd);
  if (pd) {
    var config = require(path.join(pd, CONFIG_FILENAME));
    if (options.firebase) { config.firebase = options.firebase; }
    return config;
  }

  if (options.allowNull) {
    return {};
  }
  throw new FirebaseError('Not in a Firebase app directory (could not locate firebase.json)', {status: 404, exit: 1});
};
