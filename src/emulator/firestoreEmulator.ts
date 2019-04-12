import * as javaEmulators from "../serve/javaEmulators";
import { EmulatorInstance, Emulators } from "../emulator/types";

export class FirestoreEmulator implements EmulatorInstance {
  constructor(private args: any) {}

  start() {
    return javaEmulators.start(Emulators.FIRESTORE, this.args);
  }

  stop() {
    return javaEmulators.stop(Emulators.FIRESTORE);
  }
}
