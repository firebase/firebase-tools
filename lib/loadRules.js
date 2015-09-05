'use strict';

var path = require('path');
var FirebaseError = require('./error');
var detectProjectRoot = require('./detectProjectRoot');
var cjson = require('cjson');

var RULES_FILENAME = 'rules.json';

module.exports = function(options) {
  options = options || {};
  /* istanbul ignore next */
  var pd = detectProjectRoot(options.cwd);
  if (pd) {
    try {
      var rules = cjson.load(path.join(pd, RULES_FILENAME));
      return rules;
    } catch (e) {
      if (e.code === 'ENOENT') {
        return null;
      }
      throw new FirebaseError('There was an error parsing your rules.json file:\n\n' + e.message, {
        exit: 1
      });
    }
  }
};
