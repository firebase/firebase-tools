import * as backend from "../backend";
import { FirebaseError } from "../../../error";
import { CLOUD_SCHEDULER_REGIONS } from "../../../gcp/location";

/**
 * Checks a schedule trigger's region to be in the list of allowed regions.
 * @param endpoint the schedule endpoint
 */
export function ensureScheduleTriggerRegion(
  endpoint: backend.Endpoint & backend.ScheduleTriggered
): Promise<void> {
  if (!CLOUD_SCHEDULER_REGIONS.find((region) => region === endpoint.region)) {
    throw new FirebaseError(`Location ${endpoint.region} is not a valid schedule trigger location`);
  }
  return Promise.resolve();
}
