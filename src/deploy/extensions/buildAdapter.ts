import * as build from "../functions/build";
import * as params from "../functions/params";
import * as backend from "../functions/backend";
import {
  ExtensionSpec,
  ExtensionConfig,
  Param as ExtensionParam,
  ParamType,
  Resource,
  FunctionResourceProperties,
  FunctionV2ResourceProperties,
} from "../../extensions/types";
import { Runtime } from "../functions/runtimes/supported";
import * as planner from "./planner";
import { isSystemParam } from "../../extensions/paramHelper";
import { partitionRecord } from "../../functional";

/**
 * Converts extension-style expressions ${FOO} or ${param:FOO} to functions-style {{ params.FOO }}
 */
function convertExtensionExpressions(obj: any): any {
  if (typeof obj === "string") {
    // Convert ${FOO} → {{ params.FOO }}
    let result = obj.replace(/\$\{([^}:]+)\}/g, "{{ params.$1 }}");
    // Convert ${param:FOO} → {{ params.FOO }}
    result = result.replace(/\$\{param:([^}]+)\}/g, "{{ params.$1 }}");
    return result;
  } else if (Array.isArray(obj)) {
    return obj.map(convertExtensionExpressions);
  } else if (obj && typeof obj === "object") {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = convertExtensionExpressions(value);
    }
    return result;
  }
  return obj;
}

/**
 * Creates a Build object from an extension spec for use with functions parameter resolution pipeline.
 */
export function createExtensionBuild(
  instanceSpec: planner.DeploymentInstanceSpec,
  extensionSpec: ExtensionSpec,
  existingInstanceConfig?: ExtensionConfig,
): build.Build {
  const rawBuild = {
    requiredAPIs: extractRequiredApis(extensionSpec),
    endpoints: extractEndpointsFromExtensionSpec(extensionSpec, instanceSpec),
    params: convertExtensionParamsToFunctionParams(
      extensionSpec.params,
      extensionSpec.systemParams,
      existingInstanceConfig,
    ),
    runtime: extractRuntimeFromExtensionSpec(extensionSpec),
  };

  // Convert extension expressions ${FOO} to functions expressions {{ params.FOO }}
  return convertExtensionExpressions(rawBuild);
}

function extractRequiredApis(extensionSpec: ExtensionSpec): build.RequiredApi[] {
  if (!extensionSpec.apis) {
    return [];
  }

  return extensionSpec.apis.map((api) => ({
    api: api.apiName,
    reason: api.reason,
  }));
}

function extractEndpointsFromExtensionSpec(
  extensionSpec: ExtensionSpec,
  instanceSpec: planner.DeploymentInstanceSpec,
): Record<string, build.Endpoint> {
  const endpoints: Record<string, build.Endpoint> = {};

  for (const resource of extensionSpec.resources) {
    if (
      resource.type === "firebaseextensions.v1beta.function" ||
      resource.type === "firebaseextensions.v1beta.v2function"
    ) {
      const functionName = resource.name;
      const endpointId = `${instanceSpec.instanceId}-${functionName}`;

      const endpoint: build.Endpoint = {
        entryPoint: getEntryPointFromResource(resource, functionName),
        platform: resource.type === "firebaseextensions.v1beta.v2function" ? "gcfv2" : "gcfv1",
        runtime: getRuntimeFromResource(resource),

        // Parameter expressions will be resolved by toBackend() after param resolution
        region: getLocationFromResource(resource)
          ? [getLocationFromResource(resource)!]
          : ["us-central1"], // Could be ["${LOCATION}"]
        project: "", // Will be populated by functions pipeline

        // These might contain expressions like "${MEMORY_SIZE}" - will be resolved
        availableMemoryMb: getMemoryFromResource(resource),
        timeoutSeconds: getTimeoutFromResource(resource),

        labels: {
          "deployment-tool": "firebase-extensions",
          "extension-instance-id": instanceSpec.instanceId,
          ...instanceSpec.labels,
        },

        ...extractTriggerFromResource(resource),
      };

      endpoints[endpointId] = endpoint;
    }
  }

  return endpoints;
}

function getEntryPointFromResource(resource: Resource, functionName: string): string {
  if (resource.type === "firebaseextensions.v1beta.function") {
    const props = resource.properties as FunctionResourceProperties["properties"];
    return props?.entryPoint || functionName;
  } else if (resource.type === "firebaseextensions.v1beta.v2function") {
    // V2 functions use the resource name as entry point
    return functionName;
  }
  return functionName;
}

function getRuntimeFromResource(resource: Resource): Runtime {
  if (resource.type === "firebaseextensions.v1beta.function") {
    const props = resource.properties as FunctionResourceProperties["properties"];
    return props?.runtime || "nodejs20";
  } else if (resource.type === "firebaseextensions.v1beta.v2function") {
    const props = resource.properties as FunctionV2ResourceProperties["properties"];
    return props?.buildConfig?.runtime || "nodejs20";
  }
  return "nodejs20";
}

function getLocationFromResource(resource: Resource): string | undefined {
  const props = resource.properties as any; // Both v1 and v2 have location
  return props?.location;
}

function getMemoryFromResource(resource: Resource): build.Field<number> {
  if (resource.type === "firebaseextensions.v1beta.function") {
    const props = resource.properties as FunctionResourceProperties["properties"];
    return props?.availableMemoryMb || null;
  } else if (resource.type === "firebaseextensions.v1beta.v2function") {
    const props = resource.properties as FunctionV2ResourceProperties["properties"];
    // V2 uses different format, need to convert if necessary
    const memory = props?.serviceConfig?.availableMemory;
    if (memory) {
      // Convert string like "512Mi" to number like 512
      const match = memory.match(/^(\d+)Mi?$/);
      if (match) {
        return parseInt(match[1]);
      }
    }
  }
  return null;
}

function getTimeoutFromResource(resource: Resource): build.Field<number> {
  if (resource.type === "firebaseextensions.v1beta.function") {
    const props = resource.properties as FunctionResourceProperties["properties"];
    // V1 timeout is a proto.Duration, need to convert to seconds
    if (props?.timeout) {
      // Assume it's already in seconds for now
      return props.timeout as any;
    }
  } else if (resource.type === "firebaseextensions.v1beta.v2function") {
    const props = resource.properties as FunctionV2ResourceProperties["properties"];
    return props?.serviceConfig?.timeoutSeconds || null;
  }
  return null;
}

function extractTriggerFromResource(
  resource: Resource,
): build.HttpsTriggered | build.EventTriggered {
  if (resource.type === "firebaseextensions.v1beta.function") {
    const props = resource.properties as FunctionResourceProperties["properties"];

    if (props?.httpsTrigger) {
      return {
        httpsTrigger: {
          invoker: null, // Extensions typically don't specify invokers
        },
      };
    }

    if (props?.eventTrigger) {
      return {
        eventTrigger: {
          eventType: props.eventTrigger.eventType,
          eventFilters: { resource: props.eventTrigger.resource },
          retry: false, // Extensions typically don't retry
        },
      };
    }
  } else if (resource.type === "firebaseextensions.v1beta.v2function") {
    const props = resource.properties as FunctionV2ResourceProperties["properties"];

    if (props?.eventTrigger) {
      const eventFilters: Record<string, string> = {};
      if (props.eventTrigger.eventFilters) {
        for (const filter of props.eventTrigger.eventFilters) {
          eventFilters[filter.attribute] = filter.value;
        }
      }

      return {
        eventTrigger: {
          eventType: props.eventTrigger.eventType,
          eventFilters,
          retry: props.eventTrigger.retryPolicy === "RETRY_POLICY_RETRY",
        },
      };
    }
  }

  // Default to HTTPS if no trigger specified
  return {
    httpsTrigger: { invoker: null },
  };
}

function extractRuntimeFromExtensionSpec(extensionSpec: ExtensionSpec): Runtime | undefined {
  for (const resource of extensionSpec.resources) {
    if (
      resource.type === "firebaseextensions.v1beta.function" ||
      resource.type === "firebaseextensions.v1beta.v2function"
    ) {
      const runtime = getRuntimeFromResource(resource);
      if (runtime) {
        return runtime;
      }
    }
  }

  return "nodejs20"; // Default for extensions
}

function convertExtensionParamsToFunctionParams(
  extensionParams: ExtensionParam[],
  systemParams: ExtensionParam[],
  existingConfig?: ExtensionConfig,
): params.Param[] {
  return [...extensionParams, ...systemParams].map((extParam) => ({
    name: extParam.param,
    label: extParam.label,
    description: extParam.description,
    type: mapExtensionTypeToFunctionType(extParam.type),
    default: getEffectiveDefault(extParam, existingConfig),
    input: convertExtensionInputToFunctionInput(extParam),
    immutable: extParam.immutable,
  }));
}

function getEffectiveDefault(
  extParam: ExtensionParam,
  existingConfig?: ExtensionConfig,
): string | undefined {
  // CRITICAL: Use existing deployed instance config as default for prompting
  if (existingConfig) {
    const existingValue =
      existingConfig.params[extParam.param] || existingConfig.systemParams[extParam.param];
    if (existingValue) {
      return existingValue; // Use deployed value as default
    }
  }

  // Handle optional extension parameters (required defaults to true if omitted)
  const isRequired = extParam.required !== false; // true if undefined or true
  if (!isRequired) {
    return extParam.default || ""; // Empty string for optional params without defaults
  }

  return extParam.default; // Fallback to extension spec default
}

function mapExtensionTypeToFunctionType(
  extType: ParamType | string | undefined,
): "string" | "int" | "boolean" | "list" | "secret" {
  switch (extType) {
    case ParamType.STRING:
    case ParamType.SELECT:
    case ParamType.SELECT_RESOURCE:
      return "string";
    case ParamType.MULTISELECT:
      return "list";
    case ParamType.SECRET:
      return "secret";
    default:
      return "string"; // Default fallback
  }
}

function convertExtensionInputToFunctionInput(extParam: ExtensionParam): any | undefined {
  if (extParam.type === ParamType.SELECT && extParam.options) {
    return {
      select: {
        options: extParam.options.map((option) => ({
          label: option.label,
          value: option.value,
        })),
      },
    };
  }

  if (extParam.type === ParamType.MULTISELECT && extParam.options) {
    return {
      multiSelect: {
        options: extParam.options.map((option) => ({
          label: option.label,
          value: option.value,
        })),
      },
    };
  }

  if (extParam.type === ParamType.SELECT_RESOURCE) {
    // For SELECT_RESOURCE, extensions have resourceType field (not in TypeScript interface)
    // Common resource types: storage.googleapis.com/Bucket
    const resourceType = (extParam as any).resourceType || "storage.googleapis.com/Bucket";
    return {
      resource: {
        type: resourceType,
      },
    };
  }

  if (extParam.validationRegex) {
    return {
      text: {
        example: extParam.example,
        validationRegex: extParam.validationRegex,
        validationErrorMessage: extParam.validationErrorMessage,
      },
    };
  }

  return undefined; // Use default text input
}

/**
 * Converts a resolved Backend back to DeploymentInstanceSpec format.
 */
export function backendToDeploymentInstanceSpec(
  backend: backend.Backend,
  envs: Record<string, params.ParamValue>,
  originalInstanceSpec: planner.DeploymentInstanceSpec,
): planner.DeploymentInstanceSpec {
  // Convert resolved parameters back to extension format
  const allResolvedParams = Object.fromEntries(
    Object.entries(envs)
      .filter(([_, paramValue]) => !paramValue.internal) // Skip internal Firebase params
      .map(([name, paramValue]) => [name, paramValue.toString()]),
  );

  const [systemParams, params] = partitionRecord(allResolvedParams, isSystemParam);

  // Handle special extension parameters (same as current logic)
  const allowedEventTypes =
    params.ALLOWED_EVENT_TYPES !== undefined
      ? params.ALLOWED_EVENT_TYPES.split(",").filter((e) => e !== "")
      : undefined;
  const eventarcChannel = params.EVENTARC_CHANNEL;

  // Remove special params from regular params
  delete params["EVENTARC_CHANNEL"];
  delete params["ALLOWED_EVENT_TYPES"];

  return {
    ...originalInstanceSpec, // Preserve instanceId, ref, localPath, etc.
    params,
    systemParams,
    allowedEventTypes,
    eventarcChannel,
  };
}
