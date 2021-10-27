// SOT for event types, constants, and related functions

export type Service = "pubsub" | "storage";

export const EVENT_V2_SERVICE_MAPPING: Record<string /* EventType*/, Service> = {
  "google.cloud.pubsub.topic.v1.messagePublished": "pubsub",
  "google.cloud.storage.object.v1.finalized": "storage",
  "google.cloud.storage.object.v1.archived": "storage",
  "google.cloud.storage.object.v1.deleted": "storage",
  "google.cloud.storage.object.v1.metadataUpdated": "storage",
};

const GCS_V2_EVENTS_SET: Set<string> = new Set<string>([
  "google.cloud.storage.object.v1.finalized",
  "google.cloud.storage.object.v1.archived",
  "google.cloud.storage.object.v1.deleted",
  "google.cloud.storage.object.v1.metadataUpdated",
]);

export function isGCSV2Event(eventType: string): boolean {
  return GCS_V2_EVENTS_SET.has(eventType);
}
