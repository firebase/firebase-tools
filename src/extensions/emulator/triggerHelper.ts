import * as backend from "../../deploy/functions/backend";
import { EmulatorLogger } from "../../emulator/emulatorLogger";
import {
  EventSchedule,
  getServiceFromEventType,
  ParsedTriggerDefinition
} from "../../emulator/functionsEmulatorShared";
import { Emulators } from "../../emulator/types";
import { FirebaseError } from "../../error";
import {
  FUNCTIONS_RESOURCE_TYPE,
  FUNCTIONS_V2_RESOURCE_TYPE,
  Resource
} from "../../extensions/types";
import * as proto from "../../gcp/proto";

/**
 * Convert a Resource into a ParsedTriggerDefinition
 */
export function functionResourceToEmulatedTriggerDefintion(
  resource: Resource
): ParsedTriggerDefinition {
  const resourceType = resource.type;
  if (resource.type === FUNCTIONS_RESOURCE_TYPE) {
    const etd: ParsedTriggerDefinition = {
      name: resource.name,
      entryPoint: resource.name,
      platform: "gcfv1",
    };
    const properties = resource.properties || {};
    proto.convertIfPresent(etd, properties, "timeoutSeconds", "timeout", proto.secondsFromDuration);
    proto.convertIfPresent(etd, properties, "regions", "location", (str: string) => [str]);
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
    } else if (properties.scheduleTrigger) {
      const schedule: EventSchedule = {
        schedule: properties.scheduleTrigger.schedule,
      };
      etd.schedule = schedule;
      etd.eventTrigger = {
        eventType: "google.pubsub.topic.publish",
        resource: "",
      };
    } else {
      EmulatorLogger.forEmulator(Emulators.FUNCTIONS).log(
        "WARN",
        `Function '${resource.name} is missing a trigger in extension.yaml. Please add one, as triggers defined in code are ignored.`
      );
    }
    return etd;
  }
  if (resource.type === FUNCTIONS_V2_RESOURCE_TYPE) {
    const etd: ParsedTriggerDefinition = {
      name: resource.name,
      entryPoint: resource.name,
      platform: "gcfv2",
    };
    const properties = resource.properties || {};
    proto.convertIfPresent(etd, properties, "regions", "location", (str: string) => [str]);
    if (properties.serviceConfig) {
      proto.copyIfPresent(etd, properties.serviceConfig, "timeoutSeconds");
      proto.convertIfPresent(
        etd,
        properties.serviceConfig,
        "availableMemoryMb",
        "availableMemory",
        (mem: string) => parseInt(mem) as backend.MemoryOptions
      );
    }
    if (properties.eventTrigger) {
      etd.eventTrigger = {
        eventType: properties.eventTrigger.eventType,
        service: getServiceFromEventType(properties.eventTrigger.eventType),
      };
      proto.copyIfPresent(etd.eventTrigger, properties.eventTrigger, "channel");
      if (properties.eventTrigger.eventFilters) {
        const eventFilters: Record<string, string> = {};
        const eventFilterPathPatterns: Record<string, string> = {};
        for (const filter of properties.eventTrigger.eventFilters) {
          if (filter.operator === undefined) {
            eventFilters[filter.attribute] = filter.value;
          } else if (filter.operator === "match-path-pattern") {
            eventFilterPathPatterns[filter.attribute] = filter.value;
          }
        }
        etd.eventTrigger.eventFilters = eventFilters;
        etd.eventTrigger.eventFilterPathPatterns = eventFilterPathPatterns;
      }
    } else {
      EmulatorLogger.forEmulator(Emulators.FUNCTIONS).log(
        "WARN",
        `Function '${resource.name} is missing a trigger in extension.yaml. Please add one, as triggers defined in code are ignored.`
      );
    }
    return etd;
  }
  throw new FirebaseError("Unexpected resource type " + resourceType);
}
