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
export async function getNonEmulatedAPIs(projectId: string, instances: planner.InstanceSpec[]): Promise<{
  apiName: string,
  instanceIds: string[],
  enabled: boolean,
}[]> {
  const nonEmulatedAPIs: Record<string, string[]> = {};
  for (const i of instances) {
    const extensionVersion = await planner.getExtensionVersion(i);
    for (const api of extensionVersion.spec.apis ?? []) {
      if (!EMULATED_APIS.includes(api.apiName)) {
        nonEmulatedAPIs[api.apiName] = [...nonEmulatedAPIs[api.apiName], i.instanceId];
      }
    }
  }
  return Promise.all(Object.entries(nonEmulatedAPIs).map(async ([apiName, instanceIds]) => {
    const enabled = await check(projectId, apiName, "extensions", true);
    return {
      apiName,
      instanceIds,
      enabled,
    }
  }))
}