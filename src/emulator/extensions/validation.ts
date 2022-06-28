/**
 * Copyright (c) 2022 Google LLC
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

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
  instances: planner.InstanceSpec[]
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
  options: Options
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
          default:
            return true;
        }
      }
    })
    .map((definition) => Constants.getServiceName(getFunctionService(definition)));
  // Remove duplicates
  return [...new Set(unemulatedTriggers)];
}
