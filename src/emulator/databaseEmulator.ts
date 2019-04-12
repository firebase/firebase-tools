import * as javaEmulators from "../serve/javaEmulators";
import { EmulatorInstance, Emulators } from "../emulator/types";

interface DatabaseEmulatorArgs {
  port?: number;
  host?: string;
}

export class DatabaseEmulator implements EmulatorInstance {
  constructor(private args: DatabaseEmulatorArgs) {}

  start(): Promise<any> {
    return javaEmulators.start(Emulators.DATABASE, this.args);
  }

  stop(): Promise<any> {
    return javaEmulators.stop(Emulators.DATABASE);
  }
}
