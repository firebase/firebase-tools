import { Emulators } from "./types";

export const DEFAULT_PORTS: { [s in Emulators]: number } = {
  ui: 4000,
  hub: 4400,
  logging: 4500,
  hosting: 5000,
  functions: 5001,
  extensions: 5001, // The Extensions Emulator runs on the same port as the Functions Emulator
  apphosting: 5002,
  firestore: 8080,
  pubsub: 8085,
  database: 9000,
  auth: 9099,
  storage: 9199,
  eventarc: 9299,
  dataconnect: 9399,
  tasks: 9499,
};

export const FIND_AVAILBLE_PORT_BY_DEFAULT: Record<Emulators, boolean> = {
  ui: true,
  hub: true,
  logging: true,
  hosting: true,
  apphosting: true,
  functions: false,
  firestore: false,
  database: false,
  pubsub: false,
  auth: false,
  storage: false,
  extensions: false,
  eventarc: true,
  dataconnect: false,
  tasks: true,
};

export const EMULATOR_DESCRIPTION: Record<Emulators, string> = {
  ui: "Emulator UI",
  hub: "emulator hub",
  logging: "Logging Emulator",
  hosting: "Hosting Emulator",
  apphosting: "App Hosting Emulator",
  functions: "Functions Emulator",
  firestore: "Firestore Emulator",
  database: "Database Emulator",
  pubsub: "Pub/Sub Emulator",
  auth: "Authentication Emulator",
  storage: "Storage Emulator",
  extensions: "Extensions Emulator",
  eventarc: "Eventarc Emulator",
  dataconnect: "Data Connect Emulator",
  tasks: "Cloud Tasks Emulator",
};

export const DEFAULT_HOST = "localhost";

export class Constants {
  // GCP projects cannot start with 'demo' so we use 'demo-' as a prefix to denote
  // an intentionally fake project.
  static FAKE_PROJECT_ID_PREFIX = "demo-";
  static FAKE_PROJECT_NUMBER = "0";

  static DEFAULT_DATABASE_EMULATOR_NAMESPACE = "fake-server";

  // Environment variable for a list of active CLI experiments
  static FIREBASE_ENABLED_EXPERIMENTS = "FIREBASE_ENABLED_EXPERIMENTS";

  // Environment variable to override SDK/CLI to point at the Firestore emulator.
  static FIRESTORE_EMULATOR_HOST = "FIRESTORE_EMULATOR_HOST";

  // Alternative (deprecated) env var for Firestore Emulator.
  static FIRESTORE_EMULATOR_ENV_ALT = "FIREBASE_FIRESTORE_EMULATOR_ADDRESS";

  // Environment variable to override SDK/CLI to point at the Realtime Database emulator.
  static FIREBASE_DATABASE_EMULATOR_HOST = "FIREBASE_DATABASE_EMULATOR_HOST";

  // Environment variable to discover the Data Connect emulator.
  static FIREBASE_DATACONNECT_EMULATOR_HOST = "FIREBASE_DATA_CONNECT_EMULATOR_HOST";

  // Alternative (deprecated) env var for Data Connect Emulator.
  static FIREBASE_DATACONNECT_ENV_ALT = "DATA_CONNECT_EMULATOR_HOST";

  // Environment variable to override SDK/CLI to point at the Firebase Auth emulator.
  static FIREBASE_AUTH_EMULATOR_HOST = "FIREBASE_AUTH_EMULATOR_HOST";

  // Environment variable to override SDK/CLI to point at the Firebase Storage emulator.
  static FIREBASE_STORAGE_EMULATOR_HOST = "FIREBASE_STORAGE_EMULATOR_HOST";

  // Environment variable to override SDK/CLI to point at the Firebase Storage emulator
  // for firebase-admin <= 9.6.0. Unlike the FIREBASE_STORAGE_EMULATOR_HOST variable
  // this one must start with 'http://'.
  static CLOUD_STORAGE_EMULATOR_HOST = "STORAGE_EMULATOR_HOST";

  // Environment variable to discover the eventarc emulator.
  static PUBSUB_EMULATOR_HOST = "PUBSUB_EMULATOR_HOST";

  // Environment variable to discover the eventarc emulator.
  static CLOUD_EVENTARC_EMULATOR_HOST = "CLOUD_EVENTARC_EMULATOR_HOST";

  // Environment variable to discover the tasks emulator.
  static CLOUD_TASKS_EMULATOR_HOST = "CLOUD_TASKS_EMULATOR_HOST";

  // Environment variable to discover the Emulator HUB
  static FIREBASE_EMULATOR_HUB = "FIREBASE_EMULATOR_HUB";
  static FIREBASE_GA_SESSION = "FIREBASE_GA_SESSION";

  static SERVICE_FIRESTORE = "firestore.googleapis.com";
  static SERVICE_REALTIME_DATABASE = "firebaseio.com";
  static SERVICE_PUBSUB = "pubsub.googleapis.com";
  static SERVICE_EVENTARC = "eventarc.googleapis.com";
  static SERVICE_CLOUD_TASKS = "cloudtasks.googleapis.com";
  static SERVICE_FIREALERTS = "firebasealerts.googleapis.com";

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
      case this.SERVICE_EVENTARC:
        return "eventarc";
      case this.SERVICE_CLOUD_TASKS:
        return "tasks";
      default:
        return service;
    }
  }

  static getDefaultHost(): string {
    return DEFAULT_HOST;
  }

  static getDefaultPort(emulator: Emulators): number {
    return DEFAULT_PORTS[emulator];
  }

  static description(name: Emulators): string {
    return EMULATOR_DESCRIPTION[name];
  }

  static isDemoProject(projectId?: string): boolean {
    return !!projectId && projectId.startsWith(this.FAKE_PROJECT_ID_PREFIX);
  }
}
