import * as backend from "../backend";
import * as iam from "../../../gcp/iam";
import * as events from "../../../functions/events";
import { obtainStorageBindings, ensureStorageTriggerRegion } from "./storage";
import { ensureFirebaseAlertsTriggerRegion } from "./firebaseAlerts";
import { validateAuthBlockingTrigger } from "./auth";

/** A standard void No Op */
const noop = (): Promise<void> => Promise.resolve();

/** A No Op that's useful for Services that don't have specific bindings but should still try to set default bindings */
const noopProjectBindings = (): Promise<Array<iam.Binding>> => Promise.resolve([]);

/** A name of a service */
export type Name = "noop" | "pubsub" | "storage" | "firebasealerts" | "authblocking";

/** A service interface for the underlying GCP event services */
export interface Service {
  readonly name: Name;
  readonly api: string;

  // dispatch functions
  requiredProjectBindings:
    | ((projectNumber: string, policy: iam.Policy) => Promise<Array<iam.Binding>>)
    | undefined;
  ensureTriggerRegion: (ep: backend.Endpoint & backend.EventTriggered) => Promise<void>;
  validateTrigger: (
    ep: backend.Endpoint & backend.BlockingTriggered,
    want: backend.Backend
  ) => void;
}

/** A noop service object, useful for v1 events */
export const NoOpService: Service = {
  name: "noop",
  api: "",
  requiredProjectBindings: undefined,
  ensureTriggerRegion: noop,
  validateTrigger: noop,
};

/** A pubsub service object */
export const PubSubService: Service = {
  name: "pubsub",
  api: "pubsub.googleapis.com",
  requiredProjectBindings: noopProjectBindings,
  ensureTriggerRegion: noop,
  validateTrigger: noop,
};

/** A storage service object */
export const StorageService: Service = {
  name: "storage",
  api: "storage.googleapis.com",
  requiredProjectBindings: obtainStorageBindings,
  ensureTriggerRegion: ensureStorageTriggerRegion,
  validateTrigger: noop,
};

/** A firebase alerts service object */
export const FirebaseAlertsService: Service = {
  name: "firebasealerts",
  api: "firebasealerts.googleapis.com",
  requiredProjectBindings: noopProjectBindings,
  ensureTriggerRegion: ensureFirebaseAlertsTriggerRegion,
  validateTrigger: noop,
};

/** A auth blocking service object */
export const AuthBlockingService: Service = {
  name: "authblocking",
  api: "identitytoolkit.googleapis.com",
  requiredProjectBindings: undefined,
  ensureTriggerRegion: noop,
  validateTrigger: validateAuthBlockingTrigger,
};

/** Mapping from event type string to service object */
export const EVENT_SERVICE_MAPPING: Record<events.Event, Service> = {
  "google.cloud.pubsub.topic.v1.messagePublished": PubSubService,
  "google.cloud.storage.object.v1.finalized": StorageService,
  "google.cloud.storage.object.v1.archived": StorageService,
  "google.cloud.storage.object.v1.deleted": StorageService,
  "google.cloud.storage.object.v1.metadataUpdated": StorageService,
  "google.firebase.firebasealerts.alerts.v1.published": FirebaseAlertsService,
  "providers/cloud.auth/eventTypes/user.beforeCreate": AuthBlockingService,
  "providers/cloud.auth/eventTypes/user.beforeSignIn": AuthBlockingService,
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
