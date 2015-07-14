'use strict';

var logError = require('./logError');

module.exports = function(client, error) {
  logError(error);
  process.exitCode = error.exit || 2;
  setTimeout(function() {
    process.exit();
  }, 1000);
};
