import { FunctionsEmulator } from "../emulator/functionsEmulator";
import { EmulatorServer } from "../emulator/emulatorServer";

// TODO(samstern): It would be better to convert this to an EmulatorServer
// but we don't have the "options" object until start() is called.
module.exports = {
  emulatorServer: undefined,

  async start(options: any): Promise<void> {
    this.emulatorServer = new EmulatorServer(new FunctionsEmulator(options, {}));
    await this.emulatorServer.start();
  },

  async connect(): Promise<void> {
    await this.emulatorServer.connect();
  },

  async stop(): Promise<void> {
    await this.emulatorServer.stop();
  },

  get(): FunctionsEmulator {
    return this.emulatorServer.get() as FunctionsEmulator;
  },
};
