'use strict';

var _ = require('lodash');
var FirebaseError = require('../lib/error');

module.exports = function(options, validTargets) {
  var targets = validTargets.filter(function(t) {
    return options.config.has(t);
  });
  if (options.only) {
    targets = _.intersection(targets, options.only.split(',').map(function(opt) {
      return opt.split(':')[0];
    }));
  } else if (options.except) {
    targets = _.difference(targets, options.except.split(','));
  }

  if (targets.length === 0) {
    throw new FirebaseError('No targets found. Valid targets are: ' + validTargets.join(','), {exit: 1});
  }
  return targets;
};
