import * as path from "path";
import * as fs from "fs";
import { logger } from "../../logger";
import { FirebaseError } from "../../error";
import * as backend from "./backend";
import * as build from "./build";
import * as params from "./params";
import * as api from "../../api";
import * as proto from "../../gcp/proto";
import * as k8s from "../../gcp/k8s";
import { readExtensionYaml } from "../../extensions/emulator/specHelper";
import {
  Resource,
  Param,
  Role,
  FUNCTIONS_RESOURCE_TYPE,
  FUNCTIONS_V2_RESOURCE_TYPE,
  FunctionResourceProperties,
  FunctionV2ResourceProperties,
} from "../../extensions/types";

/**
 * Check if extension.yaml exists at project root
 */
async function hasExtensionYaml(projectDir: string): Promise<boolean> {
  const extensionYamlPath = path.join(projectDir, "extension.yaml");
  try {
    await fs.promises.access(extensionYamlPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Convert extension parameter references to CEL format
 * ${param:NAME} -> {{ params.NAME }}
 * ${NAME} -> {{ params.NAME }} (some extensions use this shorthand)
 */
function convertParamReference(value: string): string {
  return value
    .replace(/\$\{param:([^}]+)\}/g, "{{ params.$1 }}")
    .replace(/\$\{([^:}]+)\}/g, "{{ params.$1 }}");
}

/**
 * Process any field that might contain parameter references
 */
function processField<T>(value: T): T {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "string") {
    // Check directly for parameter references
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
 * Process a memory field that might be a number, memory string, or parameter reference
 * Returns a Field<number> which can be either a number or a CEL expression string
 */
function processMemoryField(value: string | number | undefined): build.Field<number> | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === "number") {
    if (!backend.isValidMemoryOption(value)) {
      throw new FirebaseError(`Invalid memory option: ${value}MB`);
    }
    return value;
  }

  // Check for parameter references
  if (value.includes("${param:") || (value.includes("${") && value.includes("}"))) {
    return convertParamReference(value);
  }

  // Use k8s.mebibytes to parse memory strings
  try {
    const memMb = Math.round(k8s.mebibytes(value));
    if (!backend.isValidMemoryOption(memMb)) {
      throw new FirebaseError(`Invalid memory option: ${memMb}MB`);
    }
    return memMb;
  } catch (err) {
    throw new FirebaseError(`Invalid memory format: ${value}`);
  }
}

/**
 * Process a timeout field that might be a duration string or parameter reference
 * Returns a Field<number> which can be either seconds or a CEL expression string
 */
function processTimeoutField(value: string | undefined): build.Field<number> | undefined {
  if (value === undefined) {
    return undefined;
  }

  // Check for parameter references
  if (value.includes("${param:") || (value.includes("${") && value.includes("}"))) {
    return convertParamReference(value);
  }

  return proto.secondsFromDuration(value);
}

/**
 * Build trigger for v1 functions
 */
function buildV1Trigger(props: FunctionResourceProperties["properties"]): build.Triggered {
  if (props?.httpsTrigger) {
    return { httpsTrigger: {} };
  }

  if (props?.eventTrigger) {
    const eventTrigger: build.EventTrigger = {
      eventType: props.eventTrigger.eventType,
      retry: false,
    };
    if (props.eventTrigger.resource) {
      eventTrigger.eventFilters = {
        resource: processField(props.eventTrigger.resource),
      };
    }
    if (props.eventTrigger.service) {
      eventTrigger.eventFilters = {
        ...eventTrigger.eventFilters,
        service: processField(props.eventTrigger.service),
      };
    }
    return { eventTrigger };
  }

  if (props?.scheduleTrigger) {
    return {
      scheduleTrigger: {
        schedule: processField(props.scheduleTrigger.schedule) || "",
        timeZone: processField(props.scheduleTrigger.timeZone) || null,
      },
    };
  }

  if (props?.taskQueueTrigger) {
    const taskQueue: build.TaskQueueTrigger = {};
    if (props.taskQueueTrigger.rateLimits) {
      const rateLimits: build.TaskQueueRateLimits = {};
      const maxConcurrent = processField(props.taskQueueTrigger.rateLimits.maxConcurrentDispatches);
      if (maxConcurrent !== undefined) {
        rateLimits.maxConcurrentDispatches = maxConcurrent;
      }
      const maxPerSecond = processField(props.taskQueueTrigger.rateLimits.maxDispatchesPerSecond);
      if (maxPerSecond !== undefined) {
        rateLimits.maxDispatchesPerSecond = maxPerSecond;
      }
      if (Object.keys(rateLimits).length > 0) {
        taskQueue.rateLimits = rateLimits;
      }
    }
    if (props.taskQueueTrigger.retryConfig) {
      taskQueue.retryConfig = processField(props.taskQueueTrigger.retryConfig);
    }
    return { taskQueueTrigger: taskQueue };
  }

  // Default to https trigger
  return { httpsTrigger: {} };
}

/**
 * Build trigger for v2 functions
 */
function buildV2Trigger(props: FunctionV2ResourceProperties["properties"]): build.Triggered {
  if (props?.eventTrigger) {
    const eventTrigger: build.EventTrigger = {
      eventType: props.eventTrigger.eventType,
      retry: props.eventTrigger.retryPolicy === "RETRY_POLICY_RETRY",
    };

    // Convert event filters
    if (props.eventTrigger.eventFilters) {
      eventTrigger.eventFilters = {};
      for (const filter of props.eventTrigger.eventFilters) {
        eventTrigger.eventFilters[filter.attribute] = processField(filter.value);
      }
    }

    if (props.eventTrigger.triggerRegion) {
      eventTrigger.region = processField(props.eventTrigger.triggerRegion);
    }

    if (props.eventTrigger.channel) {
      eventTrigger.channel = processField(props.eventTrigger.channel);
    }

    return { eventTrigger };
  }

  // Default to https trigger for v2
  return { httpsTrigger: {} };
}

/**
 * Create endpoint with unified logic for v1 and v2
 */
function createEndpoint(resource: Resource, projectId: string): build.Endpoint {
  const isV2 = resource.type === FUNCTIONS_V2_RESOURCE_TYPE;

  if (isV2) {
    const v2Resource = resource as Resource & FunctionV2ResourceProperties;
    const props = v2Resource.properties || {};
    const triggered = buildV2Trigger(props);
    
    if (!props.buildConfig?.runtime) {
      throw new FirebaseError(`v2 function ${v2Resource.name} missing buildConfig.runtime`);
    }

    const endpoint: build.Endpoint = {
      entryPoint: v2Resource.entryPoint || v2Resource.name,
      platform: "gcfv2",
      project: projectId,
      runtime: props.buildConfig.runtime,
      region: [props.location ? processField(props.location) : api.functionsDefaultRegion()],
      ...triggered,
    };

    // Handle v2 service config
    if (props.serviceConfig) {
      const memResult = processMemoryField(props.serviceConfig.availableMemory);
      if (memResult !== undefined) {
        endpoint.availableMemoryMb = memResult;
      }

      if (props.serviceConfig.timeoutSeconds) {
        endpoint.timeoutSeconds = processField(props.serviceConfig.timeoutSeconds);
      }
      if (props.serviceConfig.minInstanceCount) {
        endpoint.minInstances = processField(props.serviceConfig.minInstanceCount);
      }
      if (props.serviceConfig.maxInstanceCount) {
        endpoint.maxInstances = processField(props.serviceConfig.maxInstanceCount);
      }
    }

    return endpoint;
  } else {
    const v1Resource = resource as Resource & FunctionResourceProperties;
    const props = v1Resource.properties || {};
    const triggered = buildV1Trigger(props);
    
    if (!props.runtime) {
      throw new FirebaseError(`v1 function ${v1Resource.name} missing runtime`);
    }

    const endpoint: build.Endpoint = {
      entryPoint: v1Resource.entryPoint || v1Resource.name,
      platform: "gcfv1",
      project: projectId,
      runtime: props.runtime,
      region: [props.location ? processField(props.location) : api.functionsDefaultRegion()],
      ...triggered,
    };

    // Handle v1 memory and timeout
    const memResult = processMemoryField(props.availableMemoryMb);
    if (memResult !== undefined) {
      endpoint.availableMemoryMb = memResult;
    }

    const timeoutResult = processTimeoutField(props.timeout);
    if (timeoutResult !== undefined) {
      endpoint.timeoutSeconds = timeoutResult;
    }

    return endpoint;
  }
}

/**
 * Convert extension resources to function endpoints
 */
function convertResources(resources: Resource[], projectId: string): Record<string, build.Endpoint> {
  const endpoints: Record<string, build.Endpoint> = {};

  for (const resource of resources) {
    const resourceName = resource.name;
    const resourceType = resource.type;

    // Only handle function resources
    if (resourceType === FUNCTIONS_RESOURCE_TYPE || resourceType === FUNCTIONS_V2_RESOURCE_TYPE) {
      endpoints[resourceName] = createEndpoint(resource, projectId);
    } else {
      logger.debug(`Skipping non-function resource: ${resourceName}`);
    }
  }

  return endpoints;
}

/**
 * Display IAM roles that the extension requires
 */
function displayIAMRoles(roles: Role[] | undefined, projectId: string): void {
  if (!roles || roles.length === 0) {
    return;
  }

  const serviceAccount = `${projectId}@appspot.gserviceaccount.com`;

  logger.info("");
  logger.info("⚠️  This extension requires the following IAM roles:");
  for (const role of roles) {
    logger.info(`   • ${role.role}: ${role.reason}`);
  }

  logger.info("");
  logger.info("To grant these roles to the default service account, run:");
  for (const role of roles) {
    logger.info(`gcloud projects add-iam-policy-binding ${projectId} \\`);
    logger.info(`  --member=serviceAccount:${serviceAccount} \\`);
    logger.info(`  --role=${role.role}`);
  }
  logger.info("");
}

/**
 * Build options array for select/multiSelect params
 */
function buildOptions(options: Array<{ label?: string; value: string | number }>) {
  return options.map((opt) => ({
    label: opt.label || String(opt.value),
    value: String(opt.value),
  }));
}

/**
 * Build text input for params with validation
 */
function buildTextInput(param: Param): params.TextInput<string> | undefined {
  if (!param.validationRegex) {
    return undefined;
  }

  const text: params.TextInput<string>["text"] = {
    validationRegex: param.validationRegex,
  };

  if (param.validationErrorMessage !== undefined) {
    text.validationErrorMessage = param.validationErrorMessage;
  }
  if (param.example !== undefined) {
    text.example = param.example;
  }

  return { text };
}

/**
 * Convert a single extension param to build param
 */
function convertParam(param: Param): params.Param {
  // Secret params are handled separately
  if (param.type === "secret") {
    return {
      type: "secret",
      name: param.param,
    };
  }

  // Build base string param
  const stringParam: params.StringParam = {
    type: "string",
    name: param.param,
    label: param.label,
  };

  // Add optional fields only if defined
  if (param.description !== undefined) {
    stringParam.description = param.description;
  }
  if (param.immutable !== undefined) {
    stringParam.immutable = param.immutable;
  }
  if (param.default !== undefined) {
    stringParam.default = processField(String(param.default));
  }

  // Add input based on param type
  switch (param.type) {
    case "select":
      if (param.options) {
        stringParam.input = {
          select: { options: buildOptions(param.options) },
        };
      }
      break;

    case "multiSelect":
      if (param.options) {
        stringParam.input = {
          multiSelect: { options: buildOptions(param.options) },
        };
      }
      break;

    case "selectResource":
      stringParam.input = {
        resource: {
          type: param.resourceType || "storage.googleapis.com/Bucket",
        },
      };
      break;

    default:
      // Check for text input with validation
      const textInput = buildTextInput(param);
      if (textInput) {
        stringParam.input = textInput;
      }
  }

  return stringParam;
}

/**
 * Convert extension params to build params
 * Extension params will be resolved during build.resolveBackend() just like regular function params
 */
function convertParams(extensionParams: Param[]): params.Param[] {
  return extensionParams.map(convertParam);
}

/**
 * Convert extension.yaml to functions Build
 */
async function adaptExtensionToBuild(projectDir: string, projectId: string): Promise<build.Build> {
  // Load extension.yaml
  const extensionSpec = await readExtensionYaml(projectDir);

  logger.info(`Detected extension "${extensionSpec.name}" v${extensionSpec.version}`);
  logger.info("Adapting extension.yaml for functions deployment...");

  // Display IAM roles (just for information)
  displayIAMRoles(extensionSpec.roles, projectId);

  // Handle lifecycle events
  if (extensionSpec.lifecycleEvents && extensionSpec.lifecycleEvents.length > 0) {
    logger.warn("⚠️  Lifecycle events are not supported in functions deployment.");
    logger.warn("   The following lifecycle events will be ignored:");
    for (const event of extensionSpec.lifecycleEvents) {
      logger.warn(`   - ${event.stage}: ${event.taskQueueTriggerFunction}`);
    }
  }

  // Start with an empty build
  const functionsBuild = build.empty();

  // Convert resources to endpoints
  functionsBuild.endpoints = convertResources(extensionSpec.resources, projectId);

  if (Object.keys(functionsBuild.endpoints).length === 0) {
    throw new FirebaseError("No function resources found in extension.yaml");
  }

  logger.info(`Found ${Object.keys(functionsBuild.endpoints).length} function(s) in extension`);

  // Convert params
  functionsBuild.params = convertParams(extensionSpec.params || []);

  // Add required APIs
  if (extensionSpec.apis) {
    functionsBuild.requiredAPIs = extensionSpec.apis.map((api) => ({
      api: api.apiName,
      reason: api.reason,
    }));
  }

  // Don't set a Build-level runtime since each endpoint has its own
  // functionsBuild.runtime is left undefined

  return functionsBuild;
}

/**
 * Check if extension.yaml exists at project root and adapt it to a Build
 */
export async function detectAndAdaptExtension(
  projectDir: string,
  sourceDir: string,
  projectId: string,
): Promise<build.Build | undefined> {
  if (!(await hasExtensionYaml(projectDir))) {
    return undefined;
  }

  return adaptExtensionToBuild(projectDir, projectId);
}
