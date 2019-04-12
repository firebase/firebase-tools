import * as javaEmulators from "../serve/javaEmulators";
import { EmulatorInstance, Emulators } from "../emulator/types";

export class FirestoreEmulator implements EmulatorInstance {
  constructor(private args: any) {}

  start(): Promise<void> {
    return javaEmulators.start(Emulators.FIRESTORE, this.args);
  }

  stop(): Promise<void> {
    return javaEmulators.stop(Emulators.FIRESTORE);
  }
}
