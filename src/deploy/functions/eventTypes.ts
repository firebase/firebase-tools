// SOT for event types, constants, and related functions

/** The type of serivce that events originate from */
export type Service = "pubsub" | "storage";

const EVENT_V2_SERVICE_MAPPING: Record<string, Service> = {
  "google.cloud.pubsub.topic.v1.messagePublished": "pubsub",
  "google.cloud.storage.object.v1.finalized": "storage",
  "google.cloud.storage.object.v1.archived": "storage",
  "google.cloud.storage.object.v1.deleted": "storage",
  "google.cloud.storage.object.v1.metadataUpdated": "storage",
};

const STORAGE_V2_EVENTS_SET: Set<string> = new Set<string>([
  "google.cloud.storage.object.v1.finalized",
  "google.cloud.storage.object.v1.archived",
  "google.cloud.storage.object.v1.deleted",
  "google.cloud.storage.object.v1.metadataUpdated",
]);

/**
 * @returns A mapping from v2 events to the underlying service
 */
export function getV2ServiceMapping(): Record<string, Service> {
  return EVENT_V2_SERVICE_MAPPING;
}

/**
 * @param eventType the event type emitted from the event service (ex~ Event Flow or EventArc)
 * @returns true if the event type is a v2 storage event, otherwise false
 */
export function isStorageV2Event(eventType: string): boolean {
  return STORAGE_V2_EVENTS_SET.has(eventType);
}
