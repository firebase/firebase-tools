import * as backend from "../backend";
import * as iam from "../../../gcp/iam";
import * as events from "../../../functions/events";
import { AuthBlockingService } from "./auth";
import { obtainStorageBindings, ensureStorageTriggerRegion } from "./storage";
import { ensureFirebaseAlertsTriggerRegion } from "./firebaseAlerts";

/** A standard void No Op */
export const noop = (): Promise<void> => Promise.resolve();

/** A No Op that's useful for Services that don't have specific bindings but should still try to set default bindings */
export const noopProjectBindings = (): Promise<Array<iam.Binding>> => Promise.resolve([]);

/** A name of a service */
export type Name = "noop" | "pubsub" | "storage" | "firebasealerts" | "authblocking";

/** A service interface for the underlying GCP event services */
export interface Service {
  readonly name: Name;
  readonly api: string;

  // dispatch functions
  requiredProjectBindings?: (
    projectNumber: string,
    policy: iam.Policy
  ) => Promise<Array<iam.Binding>>;
  ensureTriggerRegion: (ep: backend.Endpoint & backend.EventTriggered) => Promise<void>;
  validateTrigger: (
    ep: backend.Endpoint & backend.BlockingTriggered,
    want: backend.Backend
  ) => void;
  registerTrigger: (ep: backend.Endpoint & backend.BlockingTriggered) => Promise<void>;
  unregisterTrigger: (ep: backend.Endpoint & backend.BlockingTriggered) => Promise<void>;
}

/** A noop service object, useful for v1 events */
const NoOpService: Service = {
  name: "noop",
  api: "",
  ensureTriggerRegion: noop,
  validateTrigger: noop,
  registerTrigger: noop,
  unregisterTrigger: noop,
};

/** A pubsub service object */
const PubSubService: Service = {
  name: "pubsub",
  api: "pubsub.googleapis.com",
  requiredProjectBindings: noopProjectBindings,
  ensureTriggerRegion: noop,
  validateTrigger: noop,
  registerTrigger: noop,
  unregisterTrigger: noop,
};

/** A storage service object */
const StorageService: Service = {
  name: "storage",
  api: "storage.googleapis.com",
  requiredProjectBindings: obtainStorageBindings,
  ensureTriggerRegion: ensureStorageTriggerRegion,
  validateTrigger: noop,
  registerTrigger: noop,
  unregisterTrigger: noop,
};

/** A firebase alerts service object */
const FirebaseAlertsService: Service = {
  name: "firebasealerts",
  api: "firebasealerts.googleapis.com",
  requiredProjectBindings: noopProjectBindings,
  ensureTriggerRegion: ensureFirebaseAlertsTriggerRegion,
  validateTrigger: noop,
  registerTrigger: noop,
  unregisterTrigger: noop,
};

/** A auth blocking service object */
const authBlockingService = new AuthBlockingService();

/** Mapping from event type string to service object */
const EVENT_SERVICE_MAPPING: Record<events.Event, Service> = {
  "google.cloud.pubsub.topic.v1.messagePublished": PubSubService,
  "google.cloud.storage.object.v1.finalized": StorageService,
  "google.cloud.storage.object.v1.archived": StorageService,
  "google.cloud.storage.object.v1.deleted": StorageService,
  "google.cloud.storage.object.v1.metadataUpdated": StorageService,
  "google.firebase.firebasealerts.alerts.v1.published": FirebaseAlertsService,
  "providers/cloud.auth/eventTypes/user.beforeCreate": authBlockingService,
  "providers/cloud.auth/eventTypes/user.beforeSignIn": authBlockingService,
};

/**
 * Find the Service object for the given endpoint
 * @param endpoint the endpoint that we want the service for
 * @return a Service object that corresponds to the event type of the endpoint or noop
 */
export function serviceForEndpoint(endpoint: backend.Endpoint): Service {
  if (backend.isEventTriggered(endpoint)) {
    return EVENT_SERVICE_MAPPING[endpoint.eventTrigger.eventType as events.Event] || NoOpService;
  }

  if (backend.isBlockingTriggered(endpoint)) {
    return EVENT_SERVICE_MAPPING[endpoint.blockingTrigger.eventType as events.Event] || NoOpService;
  }

  return NoOpService;
}
