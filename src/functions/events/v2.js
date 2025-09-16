"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CONVERTABLE_EVENTS = exports.FIREALERTS_EVENT = exports.FIRESTORE_EVENTS = exports.TEST_LAB_EVENT = exports.REMOTE_CONFIG_EVENT = exports.DATABASE_EVENTS = exports.FIREBASE_ALERTS_PUBLISH_EVENT = exports.STORAGE_EVENTS = exports.PUBSUB_PUBLISH_EVENT = void 0;
exports.PUBSUB_PUBLISH_EVENT = "google.cloud.pubsub.topic.v1.messagePublished";
exports.STORAGE_EVENTS = [
    "google.cloud.storage.object.v1.finalized",
    "google.cloud.storage.object.v1.archived",
    "google.cloud.storage.object.v1.deleted",
    "google.cloud.storage.object.v1.metadataUpdated",
];
exports.FIREBASE_ALERTS_PUBLISH_EVENT = "google.firebase.firebasealerts.alerts.v1.published";
exports.DATABASE_EVENTS = [
    "google.firebase.database.ref.v1.written",
    "google.firebase.database.ref.v1.created",
    "google.firebase.database.ref.v1.updated",
    "google.firebase.database.ref.v1.deleted",
];
exports.REMOTE_CONFIG_EVENT = "google.firebase.remoteconfig.remoteConfig.v1.updated";
exports.TEST_LAB_EVENT = "google.firebase.testlab.testMatrix.v1.completed";
exports.FIRESTORE_EVENTS = [
    "google.cloud.firestore.document.v1.written",
    "google.cloud.firestore.document.v1.created",
    "google.cloud.firestore.document.v1.updated",
    "google.cloud.firestore.document.v1.deleted",
    "google.cloud.firestore.document.v1.written.withAuthContext",
    "google.cloud.firestore.document.v1.created.withAuthContext",
    "google.cloud.firestore.document.v1.updated.withAuthContext",
    "google.cloud.firestore.document.v1.deleted.withAuthContext",
];
exports.FIREALERTS_EVENT = "google.firebase.firebasealerts.alerts.v1.published";
// Why can't auth context be removed? This is map was added to correct a bug where a regex
// allowed any non-auth type to be converted to any auth type, but we should follow up for why
// a functon can't opt into reducing PII.
exports.CONVERTABLE_EVENTS = {
    "google.cloud.firestore.document.v1.created": "google.cloud.firestore.document.v1.created.withAuthContext",
    "google.cloud.firestore.document.v1.updated": "google.cloud.firestore.document.v1.updated.withAuthContext",
    "google.cloud.firestore.document.v1.deleted": "google.cloud.firestore.document.v1.deleted.withAuthContext",
    "google.cloud.firestore.document.v1.written": "google.cloud.firestore.document.v1.written.withAuthContext",
};
//# sourceMappingURL=v2.js.map