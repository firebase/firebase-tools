'use strict';

var Config = require('./config');
var RSVP = require('rsvp');

module.exports = function(options) {
  return new RSVP.Promise(function(resolve) {
    options.config = Config.load(options);
    resolve();
  });
};
