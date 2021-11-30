import * as backend from "../backend";
import * as iam from "../../../gcp/iam";
import { obtainStorageBindings, ensureStorageTriggerRegion } from "./storage";

const noop = (): Promise<void> => Promise.resolve();

/** A service interface for the underlying GCP event services */
export interface Service {
  readonly name: string;
  readonly api: string;

  // dispatch functions
  requiredProjectBindings: ((pId: any, p: any) => Promise<Array<iam.Binding>>) | undefined;
  ensureTriggerRegion: (ep: backend.Endpoint, et: backend.EventTrigger) => Promise<void>;
}

/** A noop service object, useful for v1 events */
export const NoOpService: Service = {
  name: "noop",
  api: "",
  requiredProjectBindings: undefined,
  ensureTriggerRegion: noop,
};
/** A pubsub service object */
export const PubSubService: Service = {
  name: "pubsub",
  api: "pubsub.googleapis.com",
  requiredProjectBindings: undefined,
  ensureTriggerRegion: noop,
};
/** A storage service object */
export const StorageService = {
  name: "storage",
  api: "storage.googleapis.com",
  requiredProjectBindings: obtainStorageBindings,
  ensureTriggerRegion: ensureStorageTriggerRegion,
};

/** Mapping from event type string to service object */
export const EVENT_SERVICE_MAPPING: Record<string, any> = {
  "google.cloud.pubsub.topic.v1.messagePublished": PubSubService,
  "google.cloud.storage.object.v1.finalized": StorageService,
  "google.cloud.storage.object.v1.archived": StorageService,
  "google.cloud.storage.object.v1.deleted": StorageService,
  "google.cloud.storage.object.v1.metadataUpdated": StorageService,
};

/**
 * Find the Service object for the given endpoint
 * @param endpoint the endpoint that we want the service for
 * @returns a Service object that corresponds to the event type of the endpoint or noop
 */
export function serviceForEndpoint(endpoint: backend.Endpoint): Service {
  if (!backend.isEventTriggered(endpoint)) {
    return NoOpService;
  }

  return EVENT_SERVICE_MAPPING[endpoint.eventTrigger.eventType] || NoOpService;
}
