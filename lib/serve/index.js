'use strict';

var _ = require('lodash');
var RSVP = require('rsvp');
var logger = require('../logger');
var TARGETS = {
  hosting: require('./hosting'),
  functions: require('./functions')
};

var _serve = function(targetNames, options) {
  _.forEach(targetNames, function(targetName) {
    var target = TARGETS[targetName];
    target.start(options);
  });

  return new RSVP.Promise(function(resolve) {
    process.on('SIGINT', function() {
      logger.info('Shutting down...');
      return RSVP.all(_.forEach(targetNames, function(targetName) {
        var target = TARGETS[targetName];
        return target.stop(options);
      })).then(resolve, resolve);
    });
  });
};

module.exports = _serve;
