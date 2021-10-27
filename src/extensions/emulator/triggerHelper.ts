import * as _ from "lodash";
import {
  ParsedTriggerDefinition,
  getServiceFromEventType,
} from "../../emulator/functionsEmulatorShared";
import { EmulatorLogger } from "../../emulator/emulatorLogger";
import { Emulators } from "../../emulator/types";

export function functionResourceToEmulatedTriggerDefintion(resource: any): ParsedTriggerDefinition {
  const etd: ParsedTriggerDefinition = {
    name: resource.name,
    entryPoint: resource.name,
  };
  const properties = _.get(resource, "properties", {});
  if (properties.timeout) {
    etd.timeout = properties.timeout;
  }
  if (properties.location) {
    etd.regions = [properties.location];
  }
  if (properties.availableMemoryMb) {
    etd.availableMemoryMb = properties.availableMemoryMb;
  }
  if (properties.httpsTrigger) {
    etd.httpsTrigger = properties.httpsTrigger;
  } else if (properties.eventTrigger) {
    properties.eventTrigger.service = getServiceFromEventType(properties.eventTrigger.eventType);
    etd.eventTrigger = properties.eventTrigger;
  } else {
    EmulatorLogger.forEmulator(Emulators.FUNCTIONS).log(
      "WARN",
      `Function '${resource.name} is missing a trigger in extension.yaml. Please add one, as triggers defined in code are ignored.`
    );
  }
  return etd;
}
