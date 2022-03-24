import * as backend from "../../deploy/functions/backend";

export const PUBSUB_PUBLISH_EVENT = "google.cloud.pubsub.topic.v1.messagePublished" as const;

export const STORAGE_EVENTS = [
  "google.cloud.storage.object.v1.finalized",
  "google.cloud.storage.object.v1.archived",
  "google.cloud.storage.object.v1.deleted",
  "google.cloud.storage.object.v1.metadataUpdated",
] as const;

export const FIREBASE_ALERTS_PUBLISH_EVENT = "google.firebase.firebasealerts.alerts.v1.published";

export type Event =
  | typeof PUBSUB_PUBLISH_EVENT
  | typeof STORAGE_EVENTS[number]
  | typeof FIREBASE_ALERTS_PUBLISH_EVENT;

type EventFunctionBase = backend.EventTriggered & { platform: backend.FunctionsPlatform };
type EventFunction = EventFunctionBase & { platform: "gcfv2" };

type PubsubFunction = EventFunction & {
  eventTrigger: Omit<EventFunction["eventTrigger"], "eventType"> & {
    eventType: typeof PUBSUB_PUBLISH_EVENT;
  };
};

type StorageFunction = EventFunction & {
  eventTrigger: Omit<EventFunction["eventTrigger"], "eventType"> & {
    eventType: typeof STORAGE_EVENTS[number];
  };
};

type AlertsFunction = EventFunction & {
  eventTrigger: Omit<EventFunction["eventTrigger"], "eventType"> & {
    eventType: typeof FIREBASE_ALERTS_PUBLISH_EVENT;
  };
};

/**
 * Returns true if given v2 endpoint is pubsub triggered.
 */
export function isPubsubTriggered(fn: EventFunctionBase): fn is PubsubFunction {
  return fn.platform === "gcfv2" && fn.eventTrigger.eventType === PUBSUB_PUBLISH_EVENT;
}

/**
 * Returns true if given v2 endpoint is storage triggered.
 */
export function isStorageTriggered(fn: EventFunctionBase): fn is StorageFunction {
  return (
    fn.platform === "gcfv2" &&
    (STORAGE_EVENTS as unknown as string[]).includes(fn.eventTrigger.eventType)
  );
}

/**
 * Returns true if given v2 endpoint is firebase alerts triggered.
 */
export function isAlertsTriggered(fn: EventFunctionBase): fn is AlertsFunction {
  return fn.platform === "gcfv2" && fn.eventTrigger.eventType === FIREBASE_ALERTS_PUBLISH_EVENT;
}
