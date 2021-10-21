// SOT for types and data models

/** Events (v2) */
export type EventType =
  | "google.cloud.pubsub.topic.v1.messagePublished"
  | "google.cloud.storage.object.v1.finalized"
  | "google.cloud.storage.object.v1.archived"
  | "google.cloud.storage.object.v1.deleted"
  | "google.cloud.storage.object.v1.metadataUpdated";
export type EventShorthand = "pubsub" | "storage";
export const EVENT_SHORTHAND_MAPPING: Record<EventType, EventShorthand> = {
  "google.cloud.pubsub.topic.v1.messagePublished": "pubsub",
  "google.cloud.storage.object.v1.finalized": "storage",
  "google.cloud.storage.object.v1.archived": "storage",
  "google.cloud.storage.object.v1.deleted": "storage",
  "google.cloud.storage.object.v1.metadataUpdated": "storage",
};

/** GCS (v2) */
export const GCS_EVENTS: Set<string> = new Set<string>([
  "google.cloud.storage.object.v1.finalized",
  "google.cloud.storage.object.v1.archived",
  "google.cloud.storage.object.v1.deleted",
  "google.cloud.storage.object.v1.metadataUpdated",
]);

// A flattening of container_registry_hosts and
// region_multiregion_map from regionconfig.borg
export const SUBDOMAIN_MAPPING: Record<string, string> = {
  "us-west1": "us",
  "us-west2": "us",
  "us-west3": "us",
  "us-west4": "us",
  "us-central1": "us",
  "us-central2": "us",
  "us-east1": "us",
  "us-east4": "us",
  "northamerica-northeast1": "us",
  "southamerica-east1": "us",
  "europe-west1": "eu",
  "europe-west2": "eu",
  "europe-west3": "eu",
  "europe-west4": "eu",
  "europe-west5": "eu",
  "europe-west6": "eu",
  "europe-central2": "eu",
  "asia-east1": "asia",
  "asia-east2": "asia",
  "asia-northeast1": "asia",
  "asia-northeast2": "asia",
  "asia-northeast3": "asia",
  "asia-south1": "asia",
  "asia-southeast2": "asia",
  "australia-southeast1": "asia",
};
