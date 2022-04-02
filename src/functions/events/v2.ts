export const PUBSUB_PUBLISH_EVENT = "google.cloud.pubsub.topic.v1.messagePublished" as const;

export const STORAGE_EVENTS = [
  "google.cloud.storage.object.v1.finalized",
  "google.cloud.storage.object.v1.archived",
  "google.cloud.storage.object.v1.deleted",
  "google.cloud.storage.object.v1.metadataUpdated",
] as const;

export const FIREBASE_ALERTS_PUBLISH_EVENT = "google.firebase.firebasealerts.alerts.v1.published";

export const BEFORE_CREATE_EVENT = "google.cloud.auth.user.v1.beforecreate"; // "google.cloud.auth.user.v1.beforeCreate";

export const BEFORE_SIGNIN_EVENT = "google.cloud.auth.user.v1.beforesignin"; // "google.cloud.auth.user.v1.beforeSignIn";

export const AUTH_BLOCKING_EVENTS = [BEFORE_CREATE_EVENT, BEFORE_SIGNIN_EVENT] as const;

export type Event =
  | typeof PUBSUB_PUBLISH_EVENT
  | typeof STORAGE_EVENTS[number]
  | typeof FIREBASE_ALERTS_PUBLISH_EVENT
  | typeof AUTH_BLOCKING_EVENTS[number];
