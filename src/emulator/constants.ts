import * as url from "url";

import { Emulators } from "./types";

const DEFAULT_PORTS: { [s in Emulators]: number } = {
  ui: 4000,
  hub: 4400,
  logging: 4500,
  hosting: 5000,
  functions: 5001,
  firestore: 8080,
  database: 9000,
  pubsub: 8085,
};

export const FIND_AVAILBLE_PORT_BY_DEFAULT: Record<Emulators, boolean> = {
  ui: true,
  hub: true,
  logging: true,
  hosting: false,
  functions: false,
  firestore: false,
  database: false,
  pubsub: false,
};

export const EMULATOR_DESCRIPTION: Record<Emulators, string> = {
  ui: "Emulator UI",
  hub: "emulator hub",
  logging: "Logging Emulator",
  hosting: "Hosting Emulator",
  functions: "Functions Emulator",
  firestore: "Firestore Emulator",
  database: "Database Emulator",
  pubsub: "Pub/Sub Emulator",
};

const DEFAULT_HOST = "localhost";

export class Constants {
  static DEFAULT_DATABASE_EMULATOR_NAMESPACE = "fake-server";

  // Environment variable to override SDK/CLI to point at the Firestore emulator.
  static FIRESTORE_EMULATOR_HOST = "FIRESTORE_EMULATOR_HOST";

  // Environment variable tok override SDK/CLI to point at the Realtime Database emulator.
  static FIREBASE_DATABASE_EMULATOR_HOST = "FIREBASE_DATABASE_EMULATOR_HOST";

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

  static description(name: Emulators): string {
    return EMULATOR_DESCRIPTION[name];
  }

  static normalizeHost(host: string): string {
    let normalized = host;
    if (!normalized.startsWith("http")) {
      normalized = `http://${normalized}`;
    }

    const u = url.parse(normalized);
    return u.hostname || DEFAULT_HOST;
  }
}
