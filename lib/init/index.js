'use strict';

var _ = require('lodash');
var chalk = require('chalk');
var RSVP = require('rsvp');

var logger = require('../logger');
var features = require('./features');

var init = function(setup, config, options) {
  var nextFeature = setup.features.shift();
  if (nextFeature) {
    logger.info(chalk.bold('\n' + chalk.gray('=== ') + _.capitalize(nextFeature) + ' Setup'));
    return RSVP.resolve(features[nextFeature](setup, config, options)).then(function() {
      return init(setup, config, options);
    });
  }
  return RSVP.resolve();
};

module.exports = init;
