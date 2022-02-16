import api from "../../api";
import * as planner from "../../deploy/extensions/planner";
import { check } from "../../ensureApiEnabled";

const EMULATED_APIS = [
  "storage-component.googleapis.com",
  "firestore.googleapis.com",
  "pubsub.googleapis.com",
  "identitytoolkit.googleapis.com",
  // TODO: Is there a RTDB API we need to add here? I couldn't find one.
];


/**
 * getNonEmulatedAPIs checks a list of InstanceSpecs for APIs that are not emulated. 
 * It returns a map of API name to list of instanceIds that use that API.
 */
export async function getNonEmulatedAPIs(instances: planner.InstanceSpec[]): Promise<Record<string, string[]>> {
  const nonEmulatedAPIs: Record<string, string[]> = {};
  for (const i of instances) {
    const extensionVersion = await planner.getExtensionVersion(i);
    for (const api of extensionVersion.spec.apis ?? []) {
      if (!EMULATED_APIS.includes(api.apiName)) {
        nonEmulatedAPIs[api.apiName] = [...nonEmulatedAPIs[api.apiName], i.instanceId];
      }
    }
  }
  return nonEmulatedAPIs;
}

export async function checkAndWarnAPI(projectId: string, apiName: string, instanceIds: string[]) {
  const enabled = await check(projectId, apiName, "extensions", true);
}