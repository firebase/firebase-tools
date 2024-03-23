import * as planner from "../../deploy/extensions/planner";
import { shouldStart } from "../controller";
import { Constants } from "../constants";
import { check } from "../../ensureApiEnabled";
import { getFunctionService } from "../functionsEmulatorShared";
import { EmulatableBackend } from "../functionsEmulator";
import { ParsedTriggerDefinition } from "../functionsEmulatorShared";
import { Emulators } from "../types";
import { Options } from "../../options";

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
  instances: planner.InstanceSpec[],
): Promise<APIInfo[]> {
  const unemulatedAPIs: Record<string, APIInfo> = {};
  for (const i of instances) {
    const extensionSpec = await planner.getExtensionSpec(i);
    for (const api of extensionSpec.apis ?? []) {
      if (!EMULATED_APIS.includes(api.apiName)) {
        if (unemulatedAPIs[api.apiName]) {
          unemulatedAPIs[api.apiName].instanceIds.push(i.instanceId);
        } else {
          const enabled =
            !Constants.isDemoProject(projectId) &&
            (await check(projectId, api.apiName, "extensions", true));
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

/**
 * Checks a EmulatableBackend for any functions that trigger off of emulators that are not running or not implemented.
 * @param backend
 */
export function checkForUnemulatedTriggerTypes(
  backend: EmulatableBackend,
  options: Options,
): string[] {
  const triggers = backend.predefinedTriggers ?? [];
  const unemulatedTriggers = triggers
    .filter((definition: ParsedTriggerDefinition) => {
      if (definition.httpsTrigger) {
        // HTTPS triggers can always be emulated.
        return false;
      }
      if (definition.eventTrigger) {
        const service: string = getFunctionService(definition);
        switch (service) {
          case Constants.SERVICE_FIRESTORE:
            return !shouldStart(options, Emulators.FIRESTORE);
          case Constants.SERVICE_REALTIME_DATABASE:
            return !shouldStart(options, Emulators.DATABASE);
          case Constants.SERVICE_PUBSUB:
            return !shouldStart(options, Emulators.PUBSUB);
          case Constants.SERVICE_AUTH:
            return !shouldStart(options, Emulators.AUTH);
          case Constants.SERVICE_STORAGE:
            return !shouldStart(options, Emulators.STORAGE);
          case Constants.SERVICE_EVENTARC:
            return !shouldStart(options, Emulators.EVENTARC);
          default:
            return true;
        }
      }
    })
    .map((definition) => Constants.getServiceName(getFunctionService(definition)));
  // Remove duplicates
  return [...new Set(unemulatedTriggers)];
}
