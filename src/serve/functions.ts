"use strict";

import { FunctionsEmulator } from "../functionsEmulator";

module.exports = {
  emulatorInstance: undefined,

  start: function(options: any) {
    this.emulatorInstance = new FunctionsEmulator(options, {});
    return this.emulatorInstance.start();
  },
  stop: function() {
    return this.emulatorInstance.stop();
  },
  get() {
    return this.emulatorInstance;
  },
};
