"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.serviceForEndpoint = exports.noopProjectBindings = exports.noop = void 0;
const backend = __importStar(require("../backend"));
const auth_1 = require("./auth");
const storage_1 = require("./storage");
const firebaseAlerts_1 = require("./firebaseAlerts");
const database_1 = require("./database");
const remoteConfig_1 = require("./remoteConfig");
const testLab_1 = require("./testLab");
const firestore_1 = require("./firestore");
/** A standard void No Op */
const noop = () => Promise.resolve();
exports.noop = noop;
/** A No Op that's useful for Services that don't have specific bindings but should still try to set default bindings */
const noopProjectBindings = () => Promise.resolve([]);
exports.noopProjectBindings = noopProjectBindings;
/** A noop service object, useful for v1 events */
const noOpService = {
    name: "noop",
    api: "",
    ensureTriggerRegion: exports.noop,
    validateTrigger: exports.noop,
    registerTrigger: exports.noop,
    unregisterTrigger: exports.noop,
};
/** A pubsub service object */
const pubSubService = {
    name: "pubsub",
    api: "pubsub.googleapis.com",
    requiredProjectBindings: exports.noopProjectBindings,
    ensureTriggerRegion: exports.noop,
    validateTrigger: exports.noop,
    registerTrigger: exports.noop,
    unregisterTrigger: exports.noop,
};
/** A storage service object */
const storageService = {
    name: "storage",
    api: "storage.googleapis.com",
    requiredProjectBindings: storage_1.obtainStorageBindings,
    ensureTriggerRegion: storage_1.ensureStorageTriggerRegion,
    validateTrigger: exports.noop,
    registerTrigger: exports.noop,
    unregisterTrigger: exports.noop,
};
/** A firebase alerts service object */
const firebaseAlertsService = {
    name: "firebasealerts",
    api: "firebasealerts.googleapis.com",
    requiredProjectBindings: exports.noopProjectBindings,
    ensureTriggerRegion: firebaseAlerts_1.ensureFirebaseAlertsTriggerRegion,
    validateTrigger: exports.noop,
    registerTrigger: exports.noop,
    unregisterTrigger: exports.noop,
};
/** A auth blocking service object */
const authBlockingService = new auth_1.AuthBlockingService();
/** A database service object */
const databaseService = {
    name: "database",
    api: "firebasedatabase.googleapis.com",
    requiredProjectBindings: exports.noopProjectBindings,
    ensureTriggerRegion: database_1.ensureDatabaseTriggerRegion,
    validateTrigger: exports.noop,
    registerTrigger: exports.noop,
    unregisterTrigger: exports.noop,
};
/** A remote config service object */
const remoteConfigService = {
    name: "remoteconfig",
    api: "firebaseremoteconfig.googleapis.com",
    requiredProjectBindings: exports.noopProjectBindings,
    ensureTriggerRegion: remoteConfig_1.ensureRemoteConfigTriggerRegion,
    validateTrigger: exports.noop,
    registerTrigger: exports.noop,
    unregisterTrigger: exports.noop,
};
/** A test lab service object */
const testLabService = {
    name: "testlab",
    api: "testing.googleapis.com",
    requiredProjectBindings: exports.noopProjectBindings,
    ensureTriggerRegion: testLab_1.ensureTestLabTriggerRegion,
    validateTrigger: exports.noop,
    registerTrigger: exports.noop,
    unregisterTrigger: exports.noop,
};
/** A firestore service object */
const firestoreService = {
    name: "firestore",
    api: "firestore.googleapis.com",
    requiredProjectBindings: exports.noopProjectBindings,
    ensureTriggerRegion: firestore_1.ensureFirestoreTriggerRegion,
    validateTrigger: exports.noop,
    registerTrigger: exports.noop,
    unregisterTrigger: exports.noop,
};
/** Mapping from event type string to service object */
const EVENT_SERVICE_MAPPING = {
    "google.cloud.pubsub.topic.v1.messagePublished": pubSubService,
    "google.cloud.storage.object.v1.finalized": storageService,
    "google.cloud.storage.object.v1.archived": storageService,
    "google.cloud.storage.object.v1.deleted": storageService,
    "google.cloud.storage.object.v1.metadataUpdated": storageService,
    "google.firebase.firebasealerts.alerts.v1.published": firebaseAlertsService,
    "providers/cloud.auth/eventTypes/user.beforeCreate": authBlockingService,
    "providers/cloud.auth/eventTypes/user.beforeSignIn": authBlockingService,
    "providers/cloud.auth/eventTypes/user.beforeSendEmail": authBlockingService,
    "providers/cloud.auth/eventTypes/user.beforeSendSms": authBlockingService,
    "google.firebase.database.ref.v1.written": databaseService,
    "google.firebase.database.ref.v1.created": databaseService,
    "google.firebase.database.ref.v1.updated": databaseService,
    "google.firebase.database.ref.v1.deleted": databaseService,
    "google.firebase.remoteconfig.remoteConfig.v1.updated": remoteConfigService,
    "google.firebase.testlab.testMatrix.v1.completed": testLabService,
    "google.cloud.firestore.document.v1.written": firestoreService,
    "google.cloud.firestore.document.v1.created": firestoreService,
    "google.cloud.firestore.document.v1.updated": firestoreService,
    "google.cloud.firestore.document.v1.deleted": firestoreService,
    "google.cloud.firestore.document.v1.written.withAuthContext": firestoreService,
    "google.cloud.firestore.document.v1.created.withAuthContext": firestoreService,
    "google.cloud.firestore.document.v1.updated.withAuthContext": firestoreService,
    "google.cloud.firestore.document.v1.deleted.withAuthContext": firestoreService,
};
/**
 * Find the Service object for the given endpoint
 * @param endpoint the endpoint that we want the service for
 * @return a Service object that corresponds to the event type of the endpoint or noop
 */
function serviceForEndpoint(endpoint) {
    if (backend.isEventTriggered(endpoint)) {
        return EVENT_SERVICE_MAPPING[endpoint.eventTrigger.eventType] || noOpService;
    }
    if (backend.isBlockingTriggered(endpoint)) {
        return EVENT_SERVICE_MAPPING[endpoint.blockingTrigger.eventType] || noOpService;
    }
    return noOpService;
}
exports.serviceForEndpoint = serviceForEndpoint;
//# sourceMappingURL=index.js.map