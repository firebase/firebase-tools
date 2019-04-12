"use strict";

import * as url from "url";

import { Address, Emulators } from "./types";

const DEFAULT_PORTS: { [s in Emulators]: number } = {
  database: 9000,
  firestore: 8080,
  functions: 8088,
  hosting: 5000,
};

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

  static getAddressKey(emulator: Emulators): string {
    return `emulators.${NAMES[emulator]}.address`;
  }

  static getAddress(emulator: Emulators, options: any): Address {
    const key = this.getAddressKey(emulator);
    const addr = this.parseAddress(
      options.config.get(key, `localhost:${this.getDefaultPort(emulator)}`)
    );

    return addr;
  }

  private static parseAddress(address: string): Address {
    let normalized = address;
    if (!normalized.startsWith("http")) {
      normalized = `http://${normalized}`;
    }

    const u = url.parse(normalized);
    const host = u.hostname || "localhost";
    const portStr = u.port || "-1";
    const port = parseInt(portStr, 10);

    return { host, port };
  }
}
