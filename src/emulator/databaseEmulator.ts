import * as javaEmulators from "../serve/javaEmulators";
import { EmulatorInstance, Emulators } from "../emulator/types";

export class DatabaseEmulator implements EmulatorInstance {
  constructor(private args: any) {}

  start() {
    return javaEmulators.start(Emulators.DATABASE, this.args);
  }

  stop() {
    return javaEmulators.stop(Emulators.DATABASE);
  }
}
