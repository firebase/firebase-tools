"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Constants = exports.DEFAULT_HOST = exports.EMULATOR_DESCRIPTION = exports.FIND_AVAILBLE_PORT_BY_DEFAULT = exports.DEFAULT_PORTS = void 0;
exports.DEFAULT_PORTS = {
    ui: 4000,
    hub: 4400,
    logging: 4500,
    hosting: 5000,
    functions: 5001,
    extensions: 5001,
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
exports.FIND_AVAILBLE_PORT_BY_DEFAULT = {
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
exports.EMULATOR_DESCRIPTION = {
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
exports.DEFAULT_HOST = "localhost";
class Constants {
    static getServiceName(service) {
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
    static getDefaultHost() {
        return exports.DEFAULT_HOST;
    }
    static getDefaultPort(emulator) {
        return exports.DEFAULT_PORTS[emulator];
    }
    static description(name) {
        return exports.EMULATOR_DESCRIPTION[name];
    }
    static isDemoProject(projectId) {
        return !!projectId && projectId.startsWith(this.FAKE_PROJECT_ID_PREFIX);
    }
}
exports.Constants = Constants;
// GCP projects cannot start with 'demo' so we use 'demo-' as a prefix to denote
// an intentionally fake project.
Constants.FAKE_PROJECT_ID_PREFIX = "demo-";
Constants.FAKE_PROJECT_NUMBER = "0";
Constants.DEFAULT_DATABASE_EMULATOR_NAMESPACE = "fake-server";
// Environment variable for a list of active CLI experiments
Constants.FIREBASE_ENABLED_EXPERIMENTS = "FIREBASE_ENABLED_EXPERIMENTS";
// Environment variable to override SDK/CLI to point at the Firestore emulator.
Constants.FIRESTORE_EMULATOR_HOST = "FIRESTORE_EMULATOR_HOST";
// Alternative (deprecated) env var for Firestore Emulator.
Constants.FIRESTORE_EMULATOR_ENV_ALT = "FIREBASE_FIRESTORE_EMULATOR_ADDRESS";
// Environment variable to override SDK/CLI to point at the Realtime Database emulator.
Constants.FIREBASE_DATABASE_EMULATOR_HOST = "FIREBASE_DATABASE_EMULATOR_HOST";
// Environment variable to discover the Data Connect emulator.
Constants.FIREBASE_DATACONNECT_EMULATOR_HOST = "FIREBASE_DATA_CONNECT_EMULATOR_HOST";
// Alternative (deprecated) env var for Data Connect Emulator.
Constants.FIREBASE_DATACONNECT_ENV_ALT = "DATA_CONNECT_EMULATOR_HOST";
// Environment variable to override SDK/CLI to point at the Firebase Auth emulator.
Constants.FIREBASE_AUTH_EMULATOR_HOST = "FIREBASE_AUTH_EMULATOR_HOST";
// Environment variable to override SDK/CLI to point at the Firebase Storage emulator.
Constants.FIREBASE_STORAGE_EMULATOR_HOST = "FIREBASE_STORAGE_EMULATOR_HOST";
// Environment variable to override SDK/CLI to point at the Firebase Storage emulator
// for firebase-admin <= 9.6.0. Unlike the FIREBASE_STORAGE_EMULATOR_HOST variable
// this one must start with 'http://'.
Constants.CLOUD_STORAGE_EMULATOR_HOST = "STORAGE_EMULATOR_HOST";
// Environment variable to discover the eventarc emulator.
Constants.PUBSUB_EMULATOR_HOST = "PUBSUB_EMULATOR_HOST";
// Environment variable to discover the eventarc emulator.
Constants.CLOUD_EVENTARC_EMULATOR_HOST = "CLOUD_EVENTARC_EMULATOR_HOST";
// Environment variable to discover the tasks emulator.
Constants.CLOUD_TASKS_EMULATOR_HOST = "CLOUD_TASKS_EMULATOR_HOST";
// Environment variable to discover the Emulator HUB
Constants.FIREBASE_EMULATOR_HUB = "FIREBASE_EMULATOR_HUB";
Constants.FIREBASE_GA_SESSION = "FIREBASE_GA_SESSION";
Constants.SERVICE_FIRESTORE = "firestore.googleapis.com";
Constants.SERVICE_REALTIME_DATABASE = "firebaseio.com";
Constants.SERVICE_PUBSUB = "pubsub.googleapis.com";
Constants.SERVICE_EVENTARC = "eventarc.googleapis.com";
Constants.SERVICE_CLOUD_TASKS = "cloudtasks.googleapis.com";
Constants.SERVICE_FIREALERTS = "firebasealerts.googleapis.com";
// Note: the service name below are here solely for logging purposes.
// There is not an emulator available for these.
Constants.SERVICE_ANALYTICS = "app-measurement.com";
Constants.SERVICE_AUTH = "firebaseauth.googleapis.com";
Constants.SERVICE_CRASHLYTICS = "fabric.io";
Constants.SERVICE_REMOTE_CONFIG = "firebaseremoteconfig.googleapis.com";
Constants.SERVICE_STORAGE = "storage.googleapis.com";
Constants.SERVICE_TEST_LAB = "testing.googleapis.com";
