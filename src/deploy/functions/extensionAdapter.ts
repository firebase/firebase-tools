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
import { Runtime } from "./runtimes/supported";
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
    const processed: any = {};
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
 * Create v1 endpoint with trigger
 */
function createV1Endpoint(
  resource: Resource & FunctionResourceProperties,
  projectId: string,
  runtime: Runtime,
): build.Endpoint {
  // Convert all parameter references in properties first
  const props = resource.properties || {};

  // Build the trigger-specific part
  let triggered: build.Triggered;

  if (props.httpsTrigger) {
    triggered = { httpsTrigger: {} };
  } else if (props.eventTrigger) {
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
    triggered = { eventTrigger };
  } else if (props.scheduleTrigger) {
    const scheduleTrigger: build.ScheduleTrigger = {
      schedule: processField(props.scheduleTrigger.schedule) || "",
      timeZone: processField(props.scheduleTrigger.timeZone) || null,
    };
    triggered = { scheduleTrigger };
  } else if (props.taskQueueTrigger) {
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
    triggered = { taskQueueTrigger: taskQueue };
  } else {
    // Default to https trigger if none specified
    triggered = { httpsTrigger: {} };
  }

  // Create endpoint with all required fields and spread triggered
  const endpoint: build.Endpoint = {
    entryPoint: resource.entryPoint || resource.name,
    platform: "gcfv1" as const,
    project: projectId,
    runtime: props.runtime || runtime,
    region: [props.location ? processField(props.location) : api.functionsDefaultRegion()],
    ...triggered,
  };

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

/**
 * Create v2 endpoint with trigger
 */
function createV2Endpoint(
  resource: Resource & FunctionV2ResourceProperties,
  projectId: string,
  runtime: Runtime,
): build.Endpoint {
  const props = resource.properties || {};

  // Build the trigger-specific part
  let triggered: build.Triggered;

  if (props.eventTrigger) {
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

    triggered = { eventTrigger };
  } else {
    // Default to https trigger if none specified for v2
    triggered = { httpsTrigger: {} };
  }

  // Create endpoint with all required fields and spread triggered
  const endpoint: build.Endpoint = {
    entryPoint: resource.entryPoint || resource.name,
    platform: "gcfv2" as const,
    project: projectId,
    runtime: props.buildConfig?.runtime || runtime,
    region: [props.location ? processField(props.location) : api.functionsDefaultRegion()],
    ...triggered,
  };

  // Handle service config
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
}

/**
 * Convert extension resources to function endpoints
 */
function convertResources(
  resources: Resource[],
  projectId: string,
  runtime: Runtime,
): Record<string, build.Endpoint> {
  const endpoints: Record<string, build.Endpoint> = {};

  for (const resource of resources) {
    // Resource type guard - we know all resources have these properties
    const resourceName = resource.name;
    const resourceType = resource.type;

    // Only handle function resources
    if (resourceType === FUNCTIONS_RESOURCE_TYPE) {
      const endpoint = createV1Endpoint(
        resource as Resource & FunctionResourceProperties,
        projectId,
        runtime,
      );
      endpoints[resourceName] = endpoint;
    } else if (resourceType === FUNCTIONS_V2_RESOURCE_TYPE) {
      const endpoint = createV2Endpoint(
        resource as Resource & FunctionV2ResourceProperties,
        projectId,
        runtime,
      );
      endpoints[resourceName] = endpoint;
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
 * Convert extension params to build params
 * Extension params will be resolved during build.resolveBackend() just like regular function params
 */
function convertParams(extensionParams: Param[]): params.Param[] {
  const buildParams: params.Param[] = [];

  for (const param of extensionParams) {
    // Handle different param types
    // Extension YAML uses lowercase/camelCase (SpecParamType)
    if (param.type === "secret") {
      // Secret params have a different structure
      const secretParam: params.SecretParam = {
        type: "secret",
        name: param.param,
      };
      buildParams.push(secretParam);
    } else {
      // String-based params (including select, multiSelect, etc.)
      const stringParam: params.StringParam = {
        type: "string",
        name: param.param,
        label: param.label,
      } as params.StringParam;

      if (param.description !== undefined) {
        stringParam.description = param.description;
      }
      if (param.immutable !== undefined) {
        stringParam.immutable = param.immutable;
      }

      // Convert default value if present
      if (param.default !== undefined) {
        stringParam.default = processField(String(param.default));
      }

      // Handle different input types
      if (param.type === "select" && param.options) {
        stringParam.input = {
          select: {
            options: param.options.map((opt) => ({
              label: opt.label || String(opt.value),
              value: String(opt.value),
            })),
          },
        };
      } else if (param.type === "multiSelect" && param.options) {
        stringParam.input = {
          multiSelect: {
            options: param.options.map((opt) => ({
              label: opt.label || String(opt.value),
              value: String(opt.value),
            })),
          },
        };
      } else if (param.type === "selectResource") {
        stringParam.input = {
          resource: {
            type: param.resourceType || "storage.googleapis.com/Bucket",
          },
        };
      } else if (param.validationRegex) {
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

      buildParams.push(stringParam);
    }
  }

  return buildParams;
}

/**
 * Convert extension.yaml to functions Build
 */
async function adaptExtensionToBuild(
  projectDir: string,
  projectId: string,
  runtime: Runtime,
): Promise<build.Build> {
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
  functionsBuild.endpoints = convertResources(extensionSpec.resources, projectId, runtime);

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

  // Set runtime
  functionsBuild.runtime = runtime;

  return functionsBuild;
}

/**
 * Check if extension.yaml exists at project root and adapt it to a Build
 */
export async function detectAndAdaptExtension(
  projectDir: string,
  sourceDir: string,
  projectId: string,
  runtime: Runtime,
): Promise<build.Build | undefined> {
  if (!(await hasExtensionYaml(projectDir))) {
    return undefined;
  }

  return adaptExtensionToBuild(projectDir, projectId, runtime);
}
