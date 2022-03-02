import * as planner from "../../deploy/extensions/planner";
import { check } from "../../ensureApiEnabled";

const EMULATED_APIS = [
  "storage-component.googleapis.com",
  "firestore.googleapis.com",
  "pubsub.googleapis.com",
  "identitytoolkit.googleapis.com",
  // TODO: Is there a RTDB API we need to add here? I couldn't find one.
];

type APIInfo = {
  apiName: string;
  instanceIds: string[];
  enabled: boolean;
};
/**
 * getUnemulatedAPIs checks a list of InstanceSpecs for APIs that are not emulated.
 * It returns a map of API name to list of instanceIds that use that API.
 */
export async function getUnemulatedAPIs(
  projectId: string,
  instances: planner.InstanceSpec[]
): Promise<APIInfo[]> {
  const unemulatedAPIs: Record<string, APIInfo> = {};
  for (const i of instances) {
    const extensionVersion = await planner.getExtensionVersion(i);
    for (const api of extensionVersion.spec.apis ?? []) {
      if (!EMULATED_APIS.includes(api.apiName)) {
        if (unemulatedAPIs[api.apiName]) {
          unemulatedAPIs[api.apiName].instanceIds.push(i.instanceId);
        } else {
          const enabled = await check(projectId, api.apiName, "extensions", true);
          unemulatedAPIs[api.apiName] = {
            apiName: api.apiName,
            instanceIds: [i.instanceId],
            enabled,
          };
        }
      }
    }
  }
  return Object.values(unemulatedAPIs);
}
