import * as backend from "./backend";
import * as storage from "../../gcp/storage";
import { FirebaseError } from "../../error";
import { logger } from "../../logger";
import { regionInLocation } from "../../gcp/location";

const noop = (): Promise<void> => Promise.resolve();

const ENSURE_BY_EVENT_TYPE: Record<
  string,
  (ep: backend.EventTriggered, r: string) => Promise<void>
> = {
  "google.cloud.pubsub.topic.v1.messagePublished": noop,
  "google.cloud.storage.object.v1.finalized": ensureStorageTriggerRegion,
  "google.cloud.storage.object.v1.archived": ensureStorageTriggerRegion,
  "google.cloud.storage.object.v1.deleted": ensureStorageTriggerRegion,
  "google.cloud.storage.object.v1.metadataUpdated": ensureStorageTriggerRegion,
};

/**
 * Ensures the trigger regions are set and correct
 * @param want the list of function specs we want to deploy
 * @param have the list of function specs we have deployed
 */
export async function ensureTriggerRegions(want: backend.Backend): Promise<void> {
  const regionLookups: Array<Promise<void>> = [];
  for (const ep of backend.allEndpoints(want)) {
    if (ep.platform === "gcfv1" || !backend.isEventTriggered(ep)) {
      continue;
    }
    const lookup = ENSURE_BY_EVENT_TYPE[ep.eventTrigger.eventType];
    if (!lookup) {
      logger.debug(
        "Don't know how to ensure trigger region for event type",
        ep.eventTrigger.eventType,
        ". Deploy will fail unless this event type is global"
      );
      continue;
    }
    regionLookups.push(lookup(ep, ep.region));
  }
  await Promise.all(regionLookups);
}

/**
 * Sets a GCS event trigger's region to the region of its bucket if unset,
 * and checks for an invalid EventArc trigger region before deployment of the function
 */
async function ensureStorageTriggerRegion(
  endpoint: backend.EventTriggered,
  endpointRegion: string
): Promise<void> {
  if (!endpoint.eventTrigger.region) {
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
  }
  // check for invalid cloud storage trigger region
  if (
    endpointRegion !== endpoint.eventTrigger.region &&
    endpoint.eventTrigger.region !== "us-central1" &&
    !regionInLocation(endpointRegion, endpoint.eventTrigger.region!)
  ) {
    throw new FirebaseError("Function cannot be deployed outside of the trigger region");
  }
}
