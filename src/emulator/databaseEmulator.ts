import * as javaEmulators from "../serve/javaEmulators";
import { EmulatorInfo, EmulatorInstance, Emulators } from "../emulator/types";
import { Constants } from "./constants";

interface DatabaseEmulatorArgs {
  port?: number;
  host?: string;
  functions_emulator_port?: number;
  functions_emulator_host?: string;
}

export class DatabaseEmulator implements EmulatorInstance {
  constructor(private args: DatabaseEmulatorArgs) {}

  async start(): Promise<void> {
    return javaEmulators.start(Emulators.DATABASE, this.args);
  }

  async connect(): Promise<void> {
    // The Database emulator has no "connect" phase.
    return Promise.resolve();
  }

  async stop(): Promise<void> {
    return javaEmulators.stop(Emulators.DATABASE);
  }

  getInfo(): EmulatorInfo {
    const host = this.args.host || Constants.getDefaultHost(Emulators.DATABASE);
    const port = this.args.port || Constants.getDefaultPort(Emulators.DATABASE);

    return {
      host,
      port,
    };
  }

  getName(): Emulators {
    return Emulators.DATABASE;
  }
}
