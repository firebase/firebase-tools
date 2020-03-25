import * as url from "url";

import { Address, Emulators } from "./types";

const DEFAULT_PORTS: { [s in Emulators]: number } = {
  gui: 4000,
  hub: 4400,
  hosting: 5000,
  functions: 5001,
  firestore: 8080,
  database: 9000,
  pubsub: 8085,
};

const DEFAULT_HOST = "localhost";

export class Constants {
  static DEFAULT_DATABASE_EMULATOR_NAMESPACE = "fake-server";

  static SERVICE_FIRESTORE = "firestore.googleapis.com";
  static SERVICE_REALTIME_DATABASE = "firebaseio.com";
  static SERVICE_PUBSUB = "pubsub.googleapis.com";
  // Note: the service name below are here solely for logging purposes.
  // There is not an emulator available for these.
  static SERVICE_ANALYTICS = "app-measurement.com";
  static SERVICE_AUTH = "firebaseauth.googleapis.com";
  static SERVICE_CRASHLYTICS = "fabric.io";
  static SERVICE_REMOTE_CONFIG = "firebaseremoteconfig.googleapis.com";
  static SERVICE_STORAGE = "storage.googleapis.com";
  static SERVICE_TEST_LAB = "testing.googleapis.com";

  static getServiceName(service: string): string {
    switch (service) {
      case this.SERVICE_FIRESTORE:
        return "firestore";
      case this.SERVICE_REALTIME_DATABASE:
        return "database";
      case this.SERVICE_PUBSUB:
        return "pubsub";
      case this.SERVICE_ANALYTICS:
        return "analytics";
      case this.SERVICE_AUTH:
        return "auth";
      case this.SERVICE_CRASHLYTICS:
        return "crashlytics";
      case this.SERVICE_REMOTE_CONFIG:
        return "remote config";
      case this.SERVICE_STORAGE:
        return "storage";
      case this.SERVICE_TEST_LAB:
        return "test lab";
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

  static description(name: Emulators): string {
    if (name === Emulators.HUB) {
      return "emulator hub";
    } else if (name === Emulators.GUI) {
      return "emulator GUI";
    } else {
      return `${name} emulator`;
    }
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
