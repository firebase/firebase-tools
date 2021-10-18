import * as backend from "./backend";
import * as storage from "../../gcp/storage";
import { FirebaseError } from "../../error";
import { addServiceAccountToRoles } from "../../gcp/resourceManager";

/**
 * Sets the trigger region to what we currently have deployed
 * @param want the list of function specs we want to deploy
 * @param have the list of function specs we have deployed
 */
export async function setTriggerRegion(
  want: backend.FunctionSpec[],
  have: backend.FunctionSpec[]
): Promise<void> {
  for (const wantFn of want) {
    if (wantFn.platform === "gcfv1" || !backend.isEventTrigger(wantFn.trigger)) {
      continue;
    }
    const match = have.find(backend.sameFunctionName(wantFn))?.trigger as backend.EventTrigger;
    if (match?.region) {
      wantFn.trigger.region = match.region;
    } else {
      await setTriggerRegionFromTriggerType(wantFn.trigger);
    }
  }
}

/**
 * Sets the event trigger region by calling finding the region of the underlying resource
 * @param trigger the event trigger with a missing region
 *
 * @throws {@link FirebaseError} when the region is not found
 */
async function setTriggerRegionFromTriggerType(trigger: backend.EventTrigger): Promise<void> {
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

interface StorageServiceAccountResponse {
  email_address: string;
  kind: string;
}

export async function enableStoragePermissions(projectId: string): Promise<void> {
  const iamRoles = ["roles/pubsub.publisher"];
  const storageResponse = (await storage.getServiceAccount(
    projectId
  )) as StorageServiceAccountResponse;
  await addServiceAccountToRoles(projectId, storageResponse.email_address, iamRoles);
}
