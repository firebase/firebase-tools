'use strict';

var fsutils = require('./fsutils');
var path = require('path');
var cjson = require('cjson');
var utils = require('./utils');
var _ = require('lodash');

/**
 * Detect all .firebaserc files traversing up from the current directory and
 * merge them together (with closest to working dir winning conflicts).
 */
module.exports = function(cwd) {
  var cur = cwd || process.cwd();
  var out = [];
  var prev;
  while (cur !== prev) {
    var potential = path.resolve(cur, './.firebaserc');
    if (fsutils.fileExistsSync(potential)) {
      try {
        out.push(cjson.load(potential));
      } catch (e) {
        // a malformed .firebaserc is a warning, not an error
        utils.logWarning('JSON parsing error while trying to load ' + potential);
      }
    }

    prev = cur;
    cur = path.dirname(cur);
  }
  return _.merge.apply(null, out.reverse());
};
