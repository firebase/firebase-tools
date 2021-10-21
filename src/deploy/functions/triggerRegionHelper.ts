import * as backend from "./backend";
import * as storage from "../../gcp/storage";
import { FirebaseError } from "../../error";
import { logger } from "../../logger";

const noop = (): Promise<void> => Promise.resolve();

const LOOKUP_BY_EVENT_TYPE: Record<string, (ep: backend.EventTriggered) => Promise<void>> = {
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
    if (ep.platform === "gcfv1" || !backend.isEventTriggered(ep) || ep.eventTrigger.region) {
      continue;
    }
    const lookup = LOOKUP_BY_EVENT_TYPE[ep.eventTrigger.eventType];
    if (!lookup) {
      logger.debug(
        "Don't know how to look up trigger region for event type",
        ep.eventTrigger.eventType,
        ". Deploy will fail unless this event type is global"
      );
      continue;
    }
    regionLookups.push(lookup(ep));
  }
  await Promise.all(regionLookups);
}

/** Sets a GCS event trigger's region to the region of its bucket. */
async function lookupBucketRegion(endpoint: backend.EventTriggered): Promise<void> {
  try {
    const bucket: { location: string } = await storage.getBucket(
      endpoint.eventTrigger.eventFilters.bucket!
    );
    endpoint.eventTrigger.region = bucket.location.toLowerCase();
  } catch (err) {
    throw new FirebaseError("Can't find the storage bucket region", { original: err });
  }
}
