'use strict';

var logger = require('./logger');
var chalk = require('chalk');

module.exports = function(error) {
  if (error.children.length) {
    logger.error(chalk.underline(error.message) + ':');
    error.children.forEach(function(child) {
      var out = '- ';
      if (child.name) { out += chalk.bold(child.name) + ' '; }
      out += child.message;

      logger.error(out);
    });
  } else {
    if (error.original) { logger.debug(error.original); }
    logger.error(error.message);
  }
};
