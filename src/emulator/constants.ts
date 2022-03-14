import * as url from "url";

import { Emulators } from "./types";

const DEFAULT_PORTS: { [s in Emulators]: number } = {
  ui: 4000,
  hub: 4400,
  logging: 4500,
  hosting: 5000,
  functions: 5001,
  extensions: 5001, // The Extensions Emulator runs on the same port as the Functions Emulator
  firestore: 8080,
  pubsub: 8085,
  database: 9000,
  auth: 9099,
  storage: 9199,
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
  auth: false,
  storage: false,
  extensions: false,
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
  auth: "Authentication Emulator",
  storage: "Storage Emulator",
  extensions: "Extensions Emulator",
};

const DEFAULT_HOST = "localhost";

export class Constants {
  // GCP projects cannot start with 'demo' so we use 'demo-' as a prefix to denote
  // an intentionally fake project.
  static FAKE_PROJECT_ID_PREFIX = "demo-";
  static FAKE_PROJECT_NUMBER = "0";

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
