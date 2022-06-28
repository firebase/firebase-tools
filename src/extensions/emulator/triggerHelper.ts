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

import {
  ParsedTriggerDefinition,
  getServiceFromEventType,
} from "../../emulator/functionsEmulatorShared";
import { EmulatorLogger } from "../../emulator/emulatorLogger";
import { Emulators } from "../../emulator/types";
import { Resource } from "../../extensions/types";
import * as proto from "../../gcp/proto";

export function functionResourceToEmulatedTriggerDefintion(
  resource: Resource
): ParsedTriggerDefinition {
  const etd: ParsedTriggerDefinition = {
    name: resource.name,
    entryPoint: resource.name,
    platform: "gcfv1",
  };
  const properties = resource.properties || {};
  proto.renameIfPresent(etd, properties, "timeoutSeconds", "timeout", proto.secondsFromDuration);
  proto.renameIfPresent(etd, properties, "regions", "location", (str: string) => [str]);
  proto.copyIfPresent(etd, properties, "availableMemoryMb");
  if (properties.httpsTrigger) {
    etd.httpsTrigger = properties.httpsTrigger;
  }
  if (properties.eventTrigger) {
    etd.eventTrigger = {
      eventType: properties.eventTrigger.eventType,
      resource: properties.eventTrigger.resource,
      service: getServiceFromEventType(properties.eventTrigger.eventType),
    };
  } else {
    EmulatorLogger.forEmulator(Emulators.FUNCTIONS).log(
      "WARN",
      `Function '${resource.name} is missing a trigger in extension.yaml. Please add one, as triggers defined in code are ignored.`
    );
  }
  return etd;
}
