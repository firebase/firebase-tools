import * as backend from "../backend.js";
import { FirebaseError } from "../../../error.js";

/**
 * Sets a Test Lab event trigger's region to 'global' since the service is global
 * @param endpoint the test lab endpoint
 */
export function ensureTestLabTriggerRegion(
  endpoint: backend.Endpoint & backend.EventTriggered,
): Promise<void> {
  if (!endpoint.eventTrigger.region) {
    endpoint.eventTrigger.region = "global";
  }
  if (endpoint.eventTrigger.region !== "global") {
    throw new FirebaseError("A Test Lab trigger must specify 'global' trigger location");
  }
  return Promise.resolve();
}
