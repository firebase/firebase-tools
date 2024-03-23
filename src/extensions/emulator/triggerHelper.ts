import * as backend from "../../deploy/functions/backend";
import { EmulatorLogger } from "../../emulator/emulatorLogger";
import {
  EventSchedule,
  getServiceFromEventType,
  ParsedTriggerDefinition,
} from "../../emulator/functionsEmulatorShared";
import { Emulators } from "../../emulator/types";
import { FirebaseError } from "../../error";
import {
  FUNCTIONS_RESOURCE_TYPE,
  FUNCTIONS_V2_RESOURCE_TYPE,
  Resource,
} from "../../extensions/types";
import * as proto from "../../gcp/proto";

const SUPPORTED_SYSTEM_PARAMS = {
  "firebaseextensions.v1beta.function": {
    regions: "firebaseextensions.v1beta.function/location",
    timeoutSeconds: "firebaseextensions.v1beta.function/timeoutSeconds",
    availableMemoryMb: "firebaseextensions.v1beta.function/memory",
    labels: "firebaseextensions.v1beta.function/labels",
  },
};

/**
 * Convert a Resource into a ParsedTriggerDefinition
 */
export function functionResourceToEmulatedTriggerDefintion(
  resource: Resource,
  systemParams: Record<string, string> = {},
): ParsedTriggerDefinition {
  const resourceType = resource.type;
  if (resource.type === FUNCTIONS_RESOURCE_TYPE) {
    const etd: ParsedTriggerDefinition = {
      name: resource.name,
      entryPoint: resource.name,
      platform: "gcfv1",
    };
    // These get used today in the emultor.
    proto.convertIfPresent(
      etd,
      systemParams,
      "regions",
      SUPPORTED_SYSTEM_PARAMS[FUNCTIONS_RESOURCE_TYPE].regions,
      (str: string) => [str],
    );
    proto.convertIfPresent(
      etd,
      systemParams,
      "timeoutSeconds",
      SUPPORTED_SYSTEM_PARAMS[FUNCTIONS_RESOURCE_TYPE].timeoutSeconds,
      (d) => +d,
    );
    proto.convertIfPresent(
      etd,
      systemParams,
      "availableMemoryMb",
      SUPPORTED_SYSTEM_PARAMS[FUNCTIONS_RESOURCE_TYPE].availableMemoryMb,
      (d) => +d as backend.MemoryOptions,
    );
    // These don't, but we inject them anyway for consistency and forward compatability
    proto.convertIfPresent(
      etd,
      systemParams,
      "labels",
      SUPPORTED_SYSTEM_PARAMS[FUNCTIONS_RESOURCE_TYPE].labels,
      (str: string): Record<string, string> => {
        const ret: Record<string, string> = {};
        for (const [key, value] of str.split(",").map((label) => label.split(":"))) {
          ret[key] = value;
        }
        return ret;
      },
    );
    const properties = resource.properties || {};
    proto.convertIfPresent(etd, properties, "timeoutSeconds", "timeout", proto.secondsFromDuration);
    proto.convertIfPresent(etd, properties, "regions", "location", (str: string) => [str]);
    proto.copyIfPresent(etd, properties, "availableMemoryMb");
    if (properties.httpsTrigger !== undefined) {
      // Need to explcitly check undefined since {} is falsey
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
        `Function '${resource.name} is missing a trigger in extension.yaml. Please add one, as triggers defined in code are ignored.`,
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
        (mem: string) => parseInt(mem) as backend.MemoryOptions,
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
        `Function '${resource.name} is missing a trigger in extension.yaml. Please add one, as triggers defined in code are ignored.`,
      );
    }
    return etd;
  }
  throw new FirebaseError("Unexpected resource type " + resourceType);
}
