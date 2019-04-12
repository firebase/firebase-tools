"use strict";

import { FunctionsEmulator } from "../functionsEmulator";

module.exports = {
  emulatorInstance: undefined,

  start(options: any): Promise<void> {
    this.emulatorInstance = new FunctionsEmulator(options, {});
    return this.emulatorInstance.start();
  },
  stop(): Promise<void> {
    return this.emulatorInstance.stop();
  },
  get(): FunctionsEmulator {
    return this.emulatorInstance;
  },
};
