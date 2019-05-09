import { FunctionsEmulator, FunctionsEmulatorArgs } from "../emulator/functionsEmulator";
import { EmulatorServer } from "../emulator/emulatorServer";

// TODO(samstern): It would be better to convert this to an EmulatorServer
// but we don't have the "options" object until start() is called.
module.exports = {
  emulatorServer: undefined,

  async start(options: any, args?: FunctionsEmulatorArgs): Promise<void> {
    args = args || {};

    if (!args.disabledRuntimeFeatures) {
      // When running the functions emulator through 'firebase serve' we disable some
      // of the more adventurous features that could be breaking/unexpected behavior
      // for those used to the legacy emulator.
      args.disabledRuntimeFeatures = {
        functions_config_helper: true,
        network_filtering: true,
        timeout: true,
        memory_limiting: true,
        protect_env: true,
        admin_stubs: true,
      };
    }

    this.emulatorServer = new EmulatorServer(new FunctionsEmulator(options, args));
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
