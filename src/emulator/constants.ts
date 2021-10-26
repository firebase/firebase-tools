import * as url from "url";

import { Emulators } from "./types";

const DEFAULT_PORTS: { [s in Emulators]: number } = {
  [Emulators.UI]: 4000,
  [Emulators.HUB]: 4400,
  [Emulators.LOGGING]: 4500,
  [Emulators.HOSTING]: 5000,
  [Emulators.FUNCTIONS]: 5001,
  [Emulators.FIRESTORE]: 8080,
  [Emulators.PUBSUB]: 8085,
  [Emulators.DATABASE]: 9000,
  [Emulators.AUTH]: 9099,
  [Emulators.STORAGE]: 9199,
  [Emulators.REMOTE_CONFIG]: 9200,
};

export const FIND_AVAILBLE_PORT_BY_DEFAULT: Record<Emulators, boolean> = {
  [Emulators.UI]: true,
  [Emulators.HUB]: true,
  [Emulators.LOGGING]: true,
  [Emulators.HOSTING]: false,
  [Emulators.FUNCTIONS]: false,
  [Emulators.FIRESTORE]: false,
  [Emulators.DATABASE]: false,
  [Emulators.PUBSUB]: false,
  [Emulators.AUTH]: false,
  [Emulators.STORAGE]: false,
  [Emulators.REMOTE_CONFIG]: false,
};

export const EMULATOR_DESCRIPTION: Record<Emulators, string> = {
  [Emulators.UI]: "Emulator UI",
  [Emulators.HUB]: "emulator hub",
  [Emulators.LOGGING]: "Logging Emulator",
  [Emulators.HOSTING]: "Hosting Emulator",
  [Emulators.FUNCTIONS]: "Functions Emulator",
  [Emulators.FIRESTORE]: "Firestore Emulator",
  [Emulators.DATABASE]: "Database Emulator",
  [Emulators.PUBSUB]: "Pub/Sub Emulator",
  [Emulators.AUTH]: "Authentication Emulator",
  [Emulators.STORAGE]: "Storage Emulator",
  [Emulators.REMOTE_CONFIG]: "Remote Config Emulator",
};

const DEFAULT_HOST = "localhost";

export class Constants {
  // GCP projects cannot start with 'demo' so we use 'demo-' as a prefix to denote
  // an intentionally fake project.
  static FAKE_PROJECT_ID_PREFIX = "demo-";

  static DEFAULT_DATABASE_EMULATOR_NAMESPACE = "fake-server";

  // Environment variable to override SDK/CLI to point at the Firestore emulator.
  static FIRESTORE_EMULATOR_HOST = "FIRESTORE_EMULATOR_HOST";

  // Environment variable to override SDK/CLI to point at the Realtime Database emulator.
  static FIREBASE_DATABASE_EMULATOR_HOST = "FIREBASE_DATABASE_EMULATOR_HOST";

  // Environment variable to override SDK/CLI to point at the Firebase Auth emulator.
  static FIREBASE_AUTH_EMULATOR_HOST = "FIREBASE_AUTH_EMULATOR_HOST";

  // Environment variable to override SDK/CLI to point at the Firebase Storage emulator.
  static FIREBASE_STORAGE_EMULATOR_HOST = "FIREBASE_STORAGE_EMULATOR_HOST";

  // Environment variable to override SDK/CLI to point at the Firebase Storage emulator
  // for firebase-admin <= 9.6.0. Unlike the FIREBASE_STORAGE_EMULATOR_HOST variable
  // this one must start with 'http://'.
  static CLOUD_STORAGE_EMULATOR_HOST = "STORAGE_EMULATOR_HOST";

  // Environment variable to discover the Emulator HUB
  static FIREBASE_EMULATOR_HUB = "FIREBASE_EMULATOR_HUB";

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

  static isDemoProject(projectId?: string): boolean {
    return !!projectId && projectId.startsWith(this.FAKE_PROJECT_ID_PREFIX);
  }
}
