'use strict';

var Config = require('./config');
var RSVP = require('rsvp');

module.exports = function(options) {
  return new RSVP.Promise(function(resolve) {
    console.log('before');
    options.config = Config.load(options);
    console.log('after');
    resolve();
  });
};
