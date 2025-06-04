import * as backend from "../backend";
import { FirebaseError } from "../../../error";

/**
 * Sets a Firebase Alerts event trigger's region to 'global' since the service is global
 * @param endpoint the storage endpoint
 * @param eventTrigger the endpoints event trigger
 */
export function ensureFirebaseAlertsTriggerRegion(
  endpoint: backend.Endpoint & backend.EventTriggered,
): Promise<void> {
  if (!endpoint.eventTrigger.region) {
    endpoint.eventTrigger.region = "global";
  }
  if (endpoint.eventTrigger.region !== "global") {
    throw new FirebaseError("A firebase alerts trigger must specify 'global' trigger location");
  }
  return Promise.resolve();
}
