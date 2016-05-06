'use strict';

var env = {/* ENV */};
var hasOwnProperty = Object.prototype.hasOwnProperty;

exports.get = function(path, fallback) {
  path = path.toString();
  var segments = path.split('.');
  var cur = env;
  for (var i = 0; i < segments.length; i++) {
    if (hasOwnProperty.call(cur, segments[i])) {
      cur = cur[segments[i]];
    } else {
      if (typeof fallback !== 'undefined') {
        console.warn('Using fallback for "' + path + '" environment value');
        return fallback;
      }
      throw new Error('Environment value "' + path + '" is not configured.');
    }
  }
  return cur;
};
