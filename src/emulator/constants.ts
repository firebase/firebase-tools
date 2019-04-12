"use strict";

import { Emulators } from "./types";

const DEFAULT_PORTS: { [s in Emulators]: number } = {
  database: 9000,
  firestore: 8080,
  functions: 8088,
};

export class Constants {
  static getDefaultPort(emulator: Emulators) {
    return DEFAULT_PORTS[emulator];
  }
}
