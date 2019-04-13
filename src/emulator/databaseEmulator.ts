import * as javaEmulators from "../serve/javaEmulators";
import { EmulatorInstance, Emulators } from "../emulator/types";

interface DatabaseEmulatorArgs {
  port?: number;
  host?: string;
}

export class DatabaseEmulator implements EmulatorInstance {
  constructor(private args: DatabaseEmulatorArgs) {}

  async start(): Promise<void> {
    return javaEmulators.start(Emulators.DATABASE, this.args);
  }

  async connect(): Promise<void> {
    return;
  }

  stop(): Promise<void> {
    return javaEmulators.stop(Emulators.DATABASE);
  }
}
