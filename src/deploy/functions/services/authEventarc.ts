import * as backend from "../backend";
import { FirebaseError } from "../../../error";

/**
 * Sets a Firebase Auth Eventarc event trigger's region to 'global' since the service is global.
 * @param endpoint the auth eventarc endpoint
 */
export function ensureAuthEventarcTriggerRegion(
  endpoint: backend.Endpoint & backend.EventTriggered,
): Promise<void> {
  if (!endpoint.eventTrigger.region) {
    endpoint.eventTrigger.region = "global";
  }
  if (endpoint.eventTrigger.region !== "global") {
    throw new FirebaseError("A Firebase Auth Eventarc trigger must specify 'global' trigger location");
  }
  return Promise.resolve();
}
