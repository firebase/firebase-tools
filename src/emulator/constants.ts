import * as url from "url";

import { Address, Emulators } from "./types";

const DEFAULT_PORTS: { [s in Emulators]: number } = {
  hosting: 5000,
  functions: 5001,
  firestore: 8080,
  database: 9000,
};

const DEFAULT_HOST = "localhost";

export class Constants {
  static DEFAULT_DATABASE_EMULATOR_NAMESPACE = "fake-server";

  static SERVICE_FIRESTORE = "firestore.googleapis.com";
  static SERVICE_REALTIME_DATABASE = "firebaseio.com";

  static getServiceName(service: string): string {
    switch (service) {
      case this.SERVICE_FIRESTORE:
        return "firestore";
      case this.SERVICE_REALTIME_DATABASE:
        return "database";
      default:
        return service;
    }
  }

  static getDefaultHost(emulator: Emulators): string {
    return DEFAULT_HOST;
  }

  static getDefaultPort(emulator: Emulators): number {
    return DEFAULT_PORTS[emulator];
  }

  static getHostKey(emulator: Emulators): string {
    return `emulators.${emulator.toString()}.host`;
  }

  static getPortKey(emulator: Emulators): string {
    return `emulators.${emulator.toString()}.port`;
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
