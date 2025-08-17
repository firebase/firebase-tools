import * as path from "path";
import * as fs from "fs";
import { logger } from "../../logger";
import { FirebaseError } from "../../error";
import * as build from "./build";
import * as params from "./params";
import * as api from "../../api";
import * as proto from "../../gcp/proto";
import * as k8s from "../../gcp/k8s";
import { readExtensionYaml, DEFAULT_RUNTIME } from "../../extensions/emulator/specHelper";
import { getResourceRuntime } from "../../extensions/utils";
import {
  Resource,
  Param,
  FUNCTIONS_RESOURCE_TYPE,
  FUNCTIONS_V2_RESOURCE_TYPE,
  FunctionResourceProperties,
  FunctionV2ResourceProperties,
} from "../../extensions/types";

// Reuse validFunctionTypes from specHelper
const validFunctionTypes = [
  FUNCTIONS_RESOURCE_TYPE,
  FUNCTIONS_V2_RESOURCE_TYPE,
  "firebaseextensions.v1beta.scheduledFunction",
];

/**
 * Convert extension parameter references to CEL format
 * ${param:NAME} -> {{ params.NAME }}
 * ${NAME} -> {{ params.NAME }} (some extensions use this shorthand)
 */
function convertParamReference(value: string): string {
  return value
    .replace(/\${param:([^}]+)}/g, "{{ params.$1 }}")
    .replace(/\${([^:}]+)}/g, "{{ params.$1 }}");
}

/**
 * Process any field that might contain parameter references
 */
function processField<T>(value: T): T {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "string") {
    if (value.includes("${param:") || (value.includes("${") && value.includes("}"))) {
      return convertParamReference(value) as T;
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(processField) as T;
  }

  if (typeof value === "object") {
    const processed: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      processed[key] = processField(val);
    }
    return processed as T;
  }

  return value;
}

/**
 * Convert an extension resource to a functions deployment endpoint
 */
function createEndpoint(resource: Resource, projectId: string): build.Endpoint {
  const runtime = getResourceRuntime(resource) || DEFAULT_RUNTIME;
  const isV2 = resource.type === FUNCTIONS_V2_RESOURCE_TYPE;

  const v1Resource = resource as Resource & {
    properties?: FunctionResourceProperties["properties"];
  };
  const v2Resource = resource as Resource & {
    properties?: FunctionV2ResourceProperties["properties"];
  };

  const location = isV2 ? v2Resource.properties?.location : v1Resource.properties?.location;
  const baseEndpoint = {
    entryPoint: resource.entryPoint || resource.name,
    platform: (isV2 ? "gcfv2" : "gcfv1") as "gcfv1" | "gcfv2",
    project: projectId,
    runtime,
    region: [processField(location || api.functionsDefaultRegion())],
  };

  let endpoint: build.Endpoint;

  if (isV2 && v2Resource.properties) {
    const props = v2Resource.properties;
    if (props.eventTrigger) {
      const eventTrigger: build.EventTrigger = {
        eventType: props.eventTrigger.eventType,
        retry: props.eventTrigger.retryPolicy === "RETRY_POLICY_RETRY",
      };

      if (props.eventTrigger.eventFilters) {
        for (const filter of props.eventTrigger.eventFilters) {
          const value = processField(filter.value);
          if (filter.operator === "match-path-pattern") {
            eventTrigger.eventFilterPathPatterns = eventTrigger.eventFilterPathPatterns || {};
            eventTrigger.eventFilterPathPatterns[filter.attribute] = value as string;
          } else {
            eventTrigger.eventFilters = eventTrigger.eventFilters || {};
            eventTrigger.eventFilters[filter.attribute] = value as string;
          }
        }
      }
      if (props.eventTrigger.channel) {
        eventTrigger.channel = processField(props.eventTrigger.channel);
      }
      if (props.eventTrigger.triggerRegion) {
        eventTrigger.region = processField(props.eventTrigger.triggerRegion);
      }

      endpoint = { ...baseEndpoint, eventTrigger };
    } else {
      endpoint = { ...baseEndpoint, httpsTrigger: {} };
    }
  } else if (!isV2 && v1Resource.properties) {
    const props = v1Resource.properties;
    if (props.eventTrigger) {
      const eventTrigger: build.EventTrigger = {
        eventType: props.eventTrigger.eventType,
        retry: false,
      };

      if (props.eventTrigger.resource || props.eventTrigger.service) {
        eventTrigger.eventFilters = {};
        if (props.eventTrigger.resource) {
          eventTrigger.eventFilters.resource = processField(props.eventTrigger.resource);
        }
        if (props.eventTrigger.service) {
          eventTrigger.eventFilters.service = processField(props.eventTrigger.service);
        }
      }

      endpoint = { ...baseEndpoint, eventTrigger };
    } else if (props.scheduleTrigger) {
      endpoint = {
        ...baseEndpoint,
        scheduleTrigger: {
          schedule: processField(props.scheduleTrigger.schedule) || "",
          timeZone: processField(props.scheduleTrigger.timeZone) || null,
        },
      };
    } else if (props.taskQueueTrigger) {
      const taskQueueTrigger: build.TaskQueueTrigger = {};
      if (props.taskQueueTrigger.rateLimits) {
        taskQueueTrigger.rateLimits = processField(props.taskQueueTrigger.rateLimits);
      }
      if (props.taskQueueTrigger.retryConfig) {
        taskQueueTrigger.retryConfig = processField(props.taskQueueTrigger.retryConfig);
      }
      endpoint = { ...baseEndpoint, taskQueueTrigger };
    } else {
      endpoint = { ...baseEndpoint, httpsTrigger: {} };
    }
  } else {
    endpoint = { ...baseEndpoint, httpsTrigger: {} };
  }

  if (!isV2 && v1Resource.properties) {
    if (v1Resource.properties.timeout) {
      const timeout = v1Resource.properties.timeout;
      if (
        typeof timeout === "string" &&
        (timeout.includes("${param:") || (timeout.includes("${") && timeout.includes("}")))
      ) {
        endpoint.timeoutSeconds = processField(timeout);
      } else {
        endpoint.timeoutSeconds = proto.secondsFromDuration(timeout);
      }
    }
    if (v1Resource.properties.availableMemoryMb !== undefined) {
      endpoint.availableMemoryMb = processField(v1Resource.properties.availableMemoryMb);
    }
  } else if (isV2 && v2Resource.properties?.serviceConfig) {
    const serviceConfig = v2Resource.properties.serviceConfig;
    proto.copyIfPresent(endpoint, serviceConfig, "timeoutSeconds");
    if (endpoint.timeoutSeconds !== undefined) {
      endpoint.timeoutSeconds = processField(endpoint.timeoutSeconds);
    }
    if (serviceConfig.availableMemory !== undefined) {
      const mem = serviceConfig.availableMemory;
      if (
        typeof mem === "string" &&
        (mem.includes("${param:") || (mem.includes("${") && mem.includes("}")))
      ) {
        endpoint.availableMemoryMb = processField(mem);
      } else if (typeof mem === "string") {
        // Parse memory strings like "1GiB", "512MiB", etc.
        // Extensions use IEC notation (GiB), k8s.mebibytes expects Kubernetes notation (Gi)
        // Both represent the same binary values (1024-based), just different notation
        const k8sFormat = mem.replace(/([0-9.]+)([KMGT])iB$/i, "$1$2i");
        try {
          endpoint.availableMemoryMb = Math.round(k8s.mebibytes(k8sFormat));
        } catch (e: any) {
          throw new FirebaseError(`Failed to parse memory value "${mem}": ${e.message}`);
        }
      } else {
        endpoint.availableMemoryMb = mem;
      }
    }
    proto.renameIfPresent(endpoint, serviceConfig, "minInstances", "minInstanceCount");
    proto.renameIfPresent(endpoint, serviceConfig, "maxInstances", "maxInstanceCount");
    if (endpoint.minInstances !== undefined) {
      endpoint.minInstances = processField(endpoint.minInstances);
    }
    if (endpoint.maxInstances !== undefined) {
      endpoint.maxInstances = processField(endpoint.maxInstances);
    }
  }

  return endpoint;
}

/**
 * Convert extension params to build params
 */
function convertParam(param: Param): params.Param {
  if (param.type === "secret") {
    return {
      type: "secret",
      name: param.param,
    };
  }

  const stringParam: params.StringParam = {
    type: "string",
    name: param.param,
    label: param.label,
  };

  if (param.description !== undefined) stringParam.description = param.description;
  if (param.immutable !== undefined) stringParam.immutable = param.immutable;
  if (param.default !== undefined) stringParam.default = processField(String(param.default));

  // Handle different input types
  switch (param.type) {
    case "select": {
      if (param.options) {
        stringParam.input = {
          select: {
            options: param.options.map((opt) => ({
              label: opt.label || String(opt.value),
              value: String(opt.value),
            })),
          },
        };
      }
      break;
    }
    case "multiSelect": {
      if (param.options) {
        stringParam.input = {
          multiSelect: {
            options: param.options.map((opt) => ({
              label: opt.label || String(opt.value),
              value: String(opt.value),
            })),
          },
        };
      }
      break;
    }
    case "selectResource":
      stringParam.input = {
        resource: {
          type: param.resourceType || "storage.googleapis.com/Bucket",
        },
      };
      break;
    default:
      if (param.validationRegex) {
        const text: params.TextInput<string>["text"] = {
          validationRegex: param.validationRegex,
        };
        if (param.validationErrorMessage !== undefined) {
          text.validationErrorMessage = param.validationErrorMessage;
        }
        if (param.example !== undefined) {
          text.example = param.example;
        }
        stringParam.input = { text };
      }
  }

  return stringParam;
}

/**
 * Detect and convert extension.yaml to functions Build format for deployment
 */
export async function detectAndAdaptExtension(
  projectDir: string,
  projectId: string,
): Promise<build.Build | undefined> {
  const extensionYamlPath = path.join(projectDir, "extension.yaml");

  try {
    await fs.promises.access(extensionYamlPath);
  } catch {
    return undefined;
  }

  const extensionSpec = await readExtensionYaml(projectDir);

  if (!extensionSpec.name || !extensionSpec.version) {
    throw new FirebaseError("extension.yaml is missing required fields: name or version");
  }

  if (!extensionSpec.resources || extensionSpec.resources.length === 0) {
    throw new FirebaseError("extension.yaml must contain at least one resource");
  }

  logger.info(`Detected extension "${extensionSpec.name}" v${extensionSpec.version}`);
  logger.info("Adapting extension.yaml for functions deployment...");

  // TODO: Handle IAM roles - extensions can require specific IAM roles for their service account
  // TODO: Support lifecycle events (onInstall, onUpdate, onConfigure) - these are task queue functions

  const functionsBuild = build.empty();

  functionsBuild.endpoints = {};
  for (const resource of extensionSpec.resources) {
    if (validFunctionTypes.includes(resource.type)) {
      functionsBuild.endpoints[resource.name] = createEndpoint(resource, projectId);
    }
  }

  if (Object.keys(functionsBuild.endpoints).length === 0) {
    throw new FirebaseError("No function resources found in extension.yaml");
  }

  logger.info(`Found ${Object.keys(functionsBuild.endpoints).length} function(s) in extension`);

  functionsBuild.params = (extensionSpec.params || []).map(convertParam);

  if (extensionSpec.apis) {
    functionsBuild.requiredAPIs = extensionSpec.apis.map((api) => ({
      api: api.apiName,
      reason: api.reason,
    }));
  }

  return functionsBuild;
}
