import * as javaEmulators from "../serve/javaEmulators";
import { EmulatorInstance, Emulators } from "../emulator/types";
import { EmulatorRegistry } from "./registry";

interface FirestoreEmulatorArgs {
  port?: number;
  host?: string;
  functions_emulator?: string;
}

export class FirestoreEmulator implements EmulatorInstance {
  constructor(private args: FirestoreEmulatorArgs) {}

  start(): Promise<void> {
    const functionsPort = EmulatorRegistry.getPort(Emulators.FUNCTIONS);
    if (functionsPort >= 0) {
      this.args.functions_emulator = `localhost:${functionsPort}`;
    }

    return javaEmulators.start(Emulators.FIRESTORE, this.args);
  }

  async connect(): Promise<void> {
    return;
  }

  stop(): Promise<void> {
    return javaEmulators.stop(Emulators.FIRESTORE);
  }
}
