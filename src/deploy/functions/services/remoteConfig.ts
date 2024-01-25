import * as backend from "../backend";
import { FirebaseError } from "../../../error";

/**
 * Sets a Remote Config event trigger's region to 'global' since the service is global
 * @param endpoint the remote config endpoint
 */
export function ensureRemoteConfigTriggerRegion(
  endpoint: backend.Endpoint & backend.EventTriggered,
): Promise<void> {
  if (!endpoint.eventTrigger.region) {
    endpoint.eventTrigger.region = "global";
  }
  if (endpoint.eventTrigger.region !== "global") {
    throw new FirebaseError("A remote config trigger must specify 'global' trigger location");
  }
  return Promise.resolve();
}
