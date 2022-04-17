import * as storage from "../../../gcp/storage";
import * as backend from "../backend";
import * as iam from "../../../gcp/iam";
import { logger } from "../../../logger";
import { FirebaseError } from "../../../error";
import { regionInLocation } from "../../../gcp/location";

const PUBSUB_PUBLISHER_ROLE = "roles/pubsub.publisher";

/**
 * Finds the required project level IAM bindings for the Cloud Storage service agent
 * @param projectId project identifier
 * @param existingPolicy the project level IAM policy
 */
export async function obtainStorageBindings(
  projectNumber: string,
  existingPolicy: iam.Policy
): Promise<Array<iam.Binding>> {
  const storageResponse = await storage.getServiceAccount(projectNumber);
  const storageServiceAgent = `serviceAccount:${storageResponse.email_address}`;
  let pubsubBinding = existingPolicy.bindings.find((b) => b.role === PUBSUB_PUBLISHER_ROLE);
  if (!pubsubBinding) {
    pubsubBinding = {
      role: PUBSUB_PUBLISHER_ROLE,
      members: [],
    };
  }
  if (!pubsubBinding.members.find((m) => m === storageServiceAgent)) {
    pubsubBinding.members.push(storageServiceAgent); // add service agent to role
  }
  return [pubsubBinding];
}

/**
 * Sets a GCS event trigger's region to the region of its bucket if unset,
 * and checks for an invalid EventArc trigger region before deployment of the function
 * @param endpoint the storage endpoint
 * @param eventTrigger the endpoints event trigger
 */
export async function ensureStorageTriggerRegion(
  endpoint: backend.Endpoint & backend.EventTriggered
): Promise<void> {
  const { eventTrigger } = endpoint;
  if (!eventTrigger.region) {
    logger.debug("Looking up bucket region for the storage event trigger");
    try {
      const bucket: { location: string } = await storage.getBucket(
        eventTrigger.eventFilters.bucket!
      );
      eventTrigger.region = bucket.location.toLowerCase();
      logger.debug("Setting the event trigger region to", eventTrigger.region, ".");
    } catch (err: any) {
      throw new FirebaseError("Can't find the storage bucket region", { original: err });
    }
  }
  // check for invalid cloud storage trigger region
  if (
    endpoint.region !== eventTrigger.region &&
    eventTrigger.region !== "us-central1" && // GCF allows any trigger to be in us-central1
    !regionInLocation(endpoint.region, eventTrigger.region)
  ) {
    throw new FirebaseError(
      `A function in region ${endpoint.region} cannot listen to a bucket in region ${eventTrigger.region}`
    );
  }
}
