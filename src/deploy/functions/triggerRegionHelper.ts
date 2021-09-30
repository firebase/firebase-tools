import * as backend from "./backend";
import * as storage from "../../gcp/storage";
import { FirebaseError } from "../../error";

/**
 * Sets the trigger region to what we currently have deployed
 * @param want the list of function specs we want to deploy
 * @param have the list of function specs we have deployed
 */
export function setTriggerRegionFromCache(
  want: backend.FunctionSpec[],
  have: backend.FunctionSpec[]
): void {
  for (const wantFn of want) {
    if (wantFn.platform === "gcfv1" || !backend.isEventTrigger(wantFn.trigger)) {
      continue;
    }
    const match = have.find(backend.sameFunctionName(wantFn))?.trigger as backend.EventTrigger;
    if (match?.region) {
      wantFn.trigger.region = match.region;
    }
  }
}

export async function setTriggerRegionFromTriggerType(trigger: backend.EventTrigger): Promise<any> {
  if (trigger.eventFilters.bucket) {
    // GCS function
    try {
      trigger.region = (
        await storage.getBucket(trigger.eventFilters.bucket)
      ).location.toLowerCase();
    } catch (err) {
      throw new FirebaseError("Can't find the storage bucket region", { original: err });
    }
  }
  // TODO: add more trigger types
}
