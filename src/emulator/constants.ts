"use strict";

import * as url from "url";

import { Address, Emulators } from "./types";

const DEFAULT_PORTS: { [s in Emulators]: number } = {
  database: 9000,
  firestore: 8080,
  functions: 8088,
  hosting: 5000,
};

const DEFAULT_HOST = "localhost";

const NAMES: { [s in Emulators]: string } = {
  database: "database",
  firestore: "firestore",
  functions: "functions",
  hosting: "hosting",
};

export class Constants {
  static getDefaultPort(emulator: Emulators): number {
    return DEFAULT_PORTS[emulator];
  }

  static getHostKey(emulator: Emulators): string {
    return `emulators.${NAMES[emulator]}.host`;
  }

  static getPortKey(emulator: Emulators): string {
    return `emulators.${NAMES[emulator]}.port`;
  }

  static getAddress(emulator: Emulators, options: any): Address {
    const hostVal = options.config.get(this.getHostKey(emulator), DEFAULT_HOST);
    const portVal = options.config.get(this.getPortKey(emulator), this.getDefaultPort(emulator));

    const host = this.normalizeHost(hostVal);
    const port = parseInt(portVal, 10);

    return { host, port };
  }

  private static normalizeHost(host: string): string {
    let normalized = host;
    if (!normalized.startsWith("http")) {
      normalized = `http://${normalized}`;
    }

    const u = url.parse(normalized);
    return u.hostname || DEFAULT_HOST;
  }
}
