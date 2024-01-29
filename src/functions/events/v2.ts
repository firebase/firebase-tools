export const PUBSUB_PUBLISH_EVENT = "google.cloud.pubsub.topic.v1.messagePublished";

export const STORAGE_EVENTS = [
  "google.cloud.storage.object.v1.finalized",
  "google.cloud.storage.object.v1.archived",
  "google.cloud.storage.object.v1.deleted",
  "google.cloud.storage.object.v1.metadataUpdated",
] as const;

export const FIREBASE_ALERTS_PUBLISH_EVENT = "google.firebase.firebasealerts.alerts.v1.published";

export const DATABASE_EVENTS = [
  "google.firebase.database.ref.v1.written",
  "google.firebase.database.ref.v1.created",
  "google.firebase.database.ref.v1.updated",
  "google.firebase.database.ref.v1.deleted",
] as const;

export const REMOTE_CONFIG_EVENT = "google.firebase.remoteconfig.remoteConfig.v1.updated";

export const TEST_LAB_EVENT = "google.firebase.testlab.testMatrix.v1.completed";

export const FIRESTORE_EVENTS = [
  "google.cloud.firestore.document.v1.written",
  "google.cloud.firestore.document.v1.created",
  "google.cloud.firestore.document.v1.updated",
  "google.cloud.firestore.document.v1.deleted",
  "google.cloud.firestore.document.v1.written.withAuthContext",
  "google.cloud.firestore.document.v1.created.withAuthContext",
  "google.cloud.firestore.document.v1.updated.withAuthContext",
  "google.cloud.firestore.document.v1.deleted.withAuthContext",
] as const;

export type Event =
  | typeof PUBSUB_PUBLISH_EVENT
  | (typeof STORAGE_EVENTS)[number]
  | typeof FIREBASE_ALERTS_PUBLISH_EVENT
  | (typeof DATABASE_EVENTS)[number]
  | typeof REMOTE_CONFIG_EVENT
  | typeof TEST_LAB_EVENT
  | (typeof FIRESTORE_EVENTS)[number];
