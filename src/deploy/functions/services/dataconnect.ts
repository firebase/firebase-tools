import * as backend from "../backend";
import { FirebaseError } from "../../../error";

/**
 * Sets a Firebase Data Connect event trigger's region to the function region.
 * @param endpoint the database endpoint
 */
export function ensureDataConnectTriggerRegion(
  endpoint: backend.Endpoint & backend.EventTriggered,
): Promise<void> {
  if (!endpoint.eventTrigger.region) {
    endpoint.eventTrigger.region = endpoint.region;
  }
  if (endpoint.eventTrigger.region !== endpoint.region) {
    throw new FirebaseError(
      "The Firebase Data Connect trigger location must match the function region.",
    );
  }
  return Promise.resolve();
}
