import * as backend from "./backend";
import * as storage from "../../gcp/storage";
import { FirebaseError } from "../../error";
import { logger } from "../../logger";
import { EventType, GCS_EVENTS, SUBDOMAIN_MAPPING } from "./types";

const noop = (): Promise<void> => Promise.resolve();

const LOOKUP_BY_EVENT_TYPE: Record<
  EventType,
  (ep: backend.EventTriggered, r: string) => Promise<void>
> = {
  "google.cloud.pubsub.topic.v1.messagePublished": noop,
  "google.cloud.storage.object.v1.finalized": lookupBucketRegion,
  "google.cloud.storage.object.v1.archived": lookupBucketRegion,
  "google.cloud.storage.object.v1.deleted": lookupBucketRegion,
  "google.cloud.storage.object.v1.metadataUpdated": lookupBucketRegion,
};

/**
 * Sets the trigger region to what we currently have deployed
 * @param want the list of function specs we want to deploy
 * @param have the list of function specs we have deployed
 */
export async function lookupMissingTriggerRegions(want: backend.Backend): Promise<void> {
  const regionLookups: Array<Promise<void>> = [];
  for (const ep of backend.allEndpoints(want)) {
    if (ep.platform === "gcfv1" || !backend.isEventTriggered(ep)) {
      continue;
    }
    gcsInvalidRegionCheck(ep);
    if (ep.eventTrigger.region) {
      continue;
    }
    const lookup = LOOKUP_BY_EVENT_TYPE[ep.eventTrigger.eventType as EventType];
    if (!lookup) {
      logger.debug(
        "Don't know how to look up trigger region for event type",
        ep.eventTrigger.eventType,
        ". Deploy will fail unless this event type is global"
      );
      continue;
    }
    regionLookups.push(lookup(ep, ep.region));
  }
  await Promise.all(regionLookups);
}

/** Sets a GCS event trigger's region to the region of its bucket. */
async function lookupBucketRegion(
  endpoint: backend.EventTriggered,
  epRegion: string
): Promise<void> {
  logger.debug("Looking up bucket region for the storage event trigger");
  try {
    const bucket: { location: string } = await storage.getBucket(
      endpoint.eventTrigger.eventFilters.bucket!
    );
    endpoint.eventTrigger.region = bucket.location.toLowerCase();
    logger.debug("Setting the event trigger region to", endpoint.eventTrigger.region, ".");
  } catch (err) {
    throw new FirebaseError("Can't find the storage bucket region", { original: err });
  }
  if (
    epRegion !== endpoint.eventTrigger.region &&
    SUBDOMAIN_MAPPING[epRegion] !== endpoint.eventTrigger.region
  ) {
    throw new FirebaseError("Function cannot be deployed outside of the trigger region");
  }
}

/** Raise error if we have a gcs trigger with an invalid function region */
function gcsInvalidRegionCheck(endpoint: backend.Endpoint) {
  if (
    backend.isEventTriggered(endpoint) &&
    endpoint.eventTrigger.region &&
    GCS_EVENTS.has(endpoint.eventTrigger.region) &&
    endpoint.region !== endpoint.eventTrigger.region &&
    SUBDOMAIN_MAPPING[endpoint.region] !== endpoint.eventTrigger.region
  ) {
    throw new FirebaseError("Function cannot be deployed outside of the trigger region");
  }
}
