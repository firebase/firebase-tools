'use strict';

var winston = require('winston');

var logger = new (winston.Logger)();
logger.exitOnError = false;

module.exports = logger;
