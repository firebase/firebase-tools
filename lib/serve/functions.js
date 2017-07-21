'use strict';

var FunctionsEmulator = require('../functionsEmulator');
var emulatorInstance;

module.exports = {
  start: function(options) {
    emulatorInstance = new FunctionsEmulator(options);
    return emulatorInstance.start();
  },
  stop: function(options) {
    return emulatorInstance.stop();
  }
};
