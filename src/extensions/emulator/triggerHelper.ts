import * as _ from "lodash";
import { EmulatedTriggerDefinition } from "../../emulator/functionsEmulatorShared";
import { Constants } from "../../emulator/constants";
import { EmulatorLogger } from "../../emulator/emulatorLogger";
import { Emulators } from "../../emulator/types";

export function functionResourceToEmulatedTriggerDefintion(
  resource: any
): EmulatedTriggerDefinition {
  const etd: EmulatedTriggerDefinition = {
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

function getServiceFromEventType(eventType: string): string {
  if (eventType.includes("firestore")) {
    return Constants.SERVICE_FIRESTORE;
  }
  if (eventType.includes("database")) {
    return Constants.SERVICE_REALTIME_DATABASE;
  }
  if (eventType.includes("pubsub")) {
    return Constants.SERVICE_PUBSUB;
  }
  // Below this point are services that do not have a emulator.
  if (eventType.includes("analytics")) {
    return Constants.SERVICE_ANALYTICS;
  }
  if (eventType.includes("auth")) {
    return Constants.SERVICE_AUTH;
  }
  if (eventType.includes("crashlytics")) {
    return Constants.SERVICE_CRASHLYTICS;
  }
  if (eventType.includes("remoteconfig")) {
    return Constants.SERVICE_REMOTE_CONFIG;
  }
  if (eventType.includes("storage")) {
    return Constants.SERVICE_STORAGE;
  }
  if (eventType.includes("testing")) {
    return Constants.SERVICE_TEST_LAB;
  }

  return "";
}
