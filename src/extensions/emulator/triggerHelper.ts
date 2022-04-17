import {
  ParsedTriggerDefinition,
  getServiceFromEventType,
} from "../../emulator/functionsEmulatorShared";
import { EmulatorLogger } from "../../emulator/emulatorLogger";
import { Emulators } from "../../emulator/types";
import * as extensionsApi from "../../extensions/extensionsApi";
import * as proto from "../../gcp/proto";

export function functionResourceToEmulatedTriggerDefintion(
  resource: extensionsApi.Resource
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
