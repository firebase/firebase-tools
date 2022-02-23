import * as backend from "../backend";
import * as iam from "../../../gcp/iam";
import { obtainStorageBindings, ensureStorageTriggerRegion } from "./storage";
import { obtainFireAlertsBindings, ensureFirebaseAlertsTriggerRegion } from "./firebaseAlerts";

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
export const StorageService: Service = {
  name: "storage",
  api: "storage.googleapis.com",
  requiredProjectBindings: obtainStorageBindings,
  ensureTriggerRegion: ensureStorageTriggerRegion,
};
/** A firebase alerts service object */
/**

1. Enable APIs

$ gcloud services enable run.googleapis.com
$ gcloud services enable logging.googleapis.com
$ gcloud services enable cloudbuild.googleapis.com
$ gcloud services enable cloudfunctions.googleapis.com
$ gcloud services enable eventarc.googleapis.com

$ gcloud services enable artifactregistry.googleapis.com

2. Create your own service account (eg: username-sa). Then grant the eventarc.eventReceiver and run.invoker roles to it.

$ gcloud iam service-accounts create [SERVICE-ACCOUNT-NAME]
$ gcloud projects add-iam-policy-binding [PROJECT-ID] \
--member serviceAccount:[SERVICE-ACCOUNT-NAME]@[PROJECT-ID].iam.gserviceaccount.com \
--role roles/eventarc.eventReceiver
$ gcloud projects add-iam-policy-binding [PROJECT-ID] \
--member serviceAccount:[SERVICE-ACCOUNT-NAME]@[PROJECT-ID].iam.gserviceaccount.com \
--role roles/run.invoker

3. Deploy your v2 function

$ gcloud alpha functions deploy [FUNCTION-NAME] \
--source=gs://[BUCKET-NAME]/nodejs10event.zip \
--runtime=nodejs14 \
--entry-point=hello \
--region=us-central1 \
--gen2 \
--trigger-event-filters=type=google.firebase.firebasealerts.alerts.v1.published,alerttype=[EVENT-FILTER-VALUE] \ (Option 1: with alert type filter)
--trigger-event-filters=type=google.firebase.firebasealerts.alerts.v1.published,alerttype=[EVENT-FILTER-VALUE],appid=[EVENT-FILTER-VALUE] \ (Option 2: with alert type and app id filters) \
--trigger-location=global


 */
export const FirebaseAlertsService: Service = {
  name: "firealerts",
  api: "logging.googleapis.com",
  requiredProjectBindings: obtainFireAlertsBindings,
  ensureTriggerRegion: ensureFirebaseAlertsTriggerRegion,
};

/** Mapping from event type string to service object */
export const EVENT_SERVICE_MAPPING: Record<string, any> = {
  "google.cloud.pubsub.topic.v1.messagePublished": PubSubService,
  "google.cloud.storage.object.v1.finalized": StorageService,
  "google.cloud.storage.object.v1.archived": StorageService,
  "google.cloud.storage.object.v1.deleted": StorageService,
  "google.cloud.storage.object.v1.metadataUpdated": StorageService,
  "firebase.firebasealerts.alerts.v1.published": FirebaseAlertsService,
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
