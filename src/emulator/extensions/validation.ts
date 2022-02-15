import * as planner from "../../deploy/extensions/planner";
import { check } from "../../ensureApiEnabled";

const EMULATED_APIS = [
  "storage-component.googleapis.com",
  "firestore.googleapis.com",
  "pubsub.googleapis.com",
  "identitytoolkit.googleapis.com",
  // TODO: Is there a RTDB API we need to add here? I couldn't find one.
];


export async function checkAPIs(projectId: string, instances: planner.InstanceSpec[]): Promise<Record<string, string[]>> {
  const apisInstancesMap: Record<string, string[]> = {};
  for (const i of instances) {
    const extensionVersion = await planner.getExtensionVersion(i);
    for (const api of extensionVersion.spec.apis ?? []) {
      if (!EMULATED_APIS.includes(api.apiName)) {
        apisInstancesMap[api.apiName] = [...apisInstancesMap[api.apiName], i.instanceId];
      }
    }
  }
  const unenabledAPIsMap: Record<string, string[]> = {}
  for (const [api, instanceNames] of Object.entries(apisInstancesMap)) {
    const enabled = await check(projectId, api, "extensions", true);
    if (!enabled) {
      unenabledAPIsMap[api] = instanceNames
    }
  }
  return unenabledAPIsMap;
}