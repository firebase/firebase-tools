export const PUBSUB_PUBLISH_EVENT = "google.cloud.pubsub.topic.v1.messagePublished" as const;

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

export type Event =
  | typeof PUBSUB_PUBLISH_EVENT
  | typeof STORAGE_EVENTS[number]
  | typeof FIREBASE_ALERTS_PUBLISH_EVENT
  | typeof DATABASE_EVENTS[number];
