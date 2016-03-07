'use strict';

var logger = require('./logger');
var chalk = require('chalk');

/* istanbul ignore next */
module.exports = function(error) {
  if (error.children && error.children.length) {
    logger.error(chalk.bold.red('Error:'), chalk.underline(error.message) + ':');
    error.children.forEach(function(child) {
      var out = '- ';
      if (child.name) { out += chalk.bold(child.name) + ' '; }
      out += child.message;

      logger.error(out);
    });
  } else {
    if (error.original) { logger.debug(error.original); }
    logger.error();
    logger.error(chalk.bold.red('Error:'), error.message);
  }
  if (error.context) { logger.debug('Error Context:', JSON.stringify(error.context, undefined, 2)); }
};
