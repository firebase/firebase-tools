'use strict';

var chalk = require('chalk');
var _ = require('lodash');
var logger = require('./logger');

module.exports = function(level, title, list, color) {
  color = color || chalk.bold;
  logger.log(level, color(_.repeat('-', title.length)));
  logger.log(level, color(title));
  logger.log(level, color(_.repeat('-', title.length)));
  list.forEach(function(item) {
    logger.log(level, item);
  });
  logger.log(level, color(_.repeat('-', title.length)));
};
