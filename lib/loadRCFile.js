'use strict';

var fsutils = require('./fsutils');
var path = require('path');
var cjson = require('cjson');
var utils = require('./utils');
var chalk = require('chalk');
var detectProjectRoot = require('./detectProjectRoot');

/**
 * .firebaserc should always be a sibling of firebase.json. If it doesn't parse,
 * it's considered a warning, not an error.
 */
module.exports = function(cwd) {
  var out = {};
  var dir = detectProjectRoot(cwd || process.cwd());
  if (!dir) {
    return out;
  }

  var potential = path.resolve(dir, './.firebaserc');
  if (fsutils.fileExistsSync(potential)) {
    try {
      out = cjson.load(potential);
    } catch (e) {
      // a malformed .firebaserc is a warning, not an error
      utils.logWarning('JSON parsing error while trying to load ' + chalk.bold(potential));
    }
  }
  return out;
};
