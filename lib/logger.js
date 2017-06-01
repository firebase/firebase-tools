'use strict';

var winston = require('winston');

function expandErrors(logger) {
  var oldLogFunc = logger.log;
  logger.log = function() {
    var args = Array.prototype.slice.call(arguments, 0);
    if (args.length >= 2 && args[1] instanceof Error) {
      args[1] = args[1].stack;
    }
    return oldLogFunc.apply(this, args);
  };
  return logger;
}

var logger = expandErrors(new winston.Logger());

var debug = logger.debug;
logger.debug = function() {
  arguments[0] = '[' + new Date().toISOString() + '] ' + (arguments[0] || '');
  debug.apply(null, arguments);
};

logger.exitOnError = false;

module.exports = logger;
