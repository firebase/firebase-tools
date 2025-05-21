import { FunctionResourceProperties, FUNCTIONS_RESOURCE_TYPE } from "../../../extensions/types";
import * as backend from "../../functions/backend";
import * as proto from "../../../gcp/proto";
import { generateExtensionFunctionId } from "./naming";

/**
 * Converts extension function properties to a Cloud Functions Endpoint configuration
 * suitable for use in the functions deployment process.
 * 
 * @param projectId The Firebase project ID
 * @param instanceId The extension instance ID
 * @param functionId The function ID within the extension
 * @param properties The function resource properties from the extension spec
 * @param params The processed parameters for the extension instance
 * @param platform The target cloud functions platform (v1 or v2)
 * @returns A backend.Endpoint configuration for the function
 */
export function convertExtensionFunctionToEndpoint(
  projectId: string,
  instanceId: string,
  functionId: string,
  properties: FunctionResourceProperties,
  params: Record<string, string>,
  platform: backend.FunctionsPlatform = "gcfv2"
): backend.Endpoint {
  if (properties.type !== FUNCTIONS_RESOURCE_TYPE) {
    throw new Error(`Unsupported resource type: ${properties.type}`);
  }

  const location = properties.properties?.location || "us-central1";
  const entryPoint = properties.properties?.entryPoint || "handler";
  const id = generateExtensionFunctionId(instanceId, functionId);
  
  // Base configuration shared by all endpoint types
  const baseConfig = {
    platform,
    id,
    region: location,
    project: projectId,
    entryPoint,
    runtime: properties.properties?.runtime || "nodejs18",
    environmentVariables: { ...params },
    // Set memory if specified
    ...(properties.properties?.availableMemoryMb && {
      availableMemoryMb: properties.properties.availableMemoryMb
    }),
    // Set timeout if specified (convert from proto.Duration to seconds)
    ...(properties.properties?.timeout && {
      timeoutSeconds: proto.secondsFromDuration(properties.properties.timeout)
    }),
    // Set secure-by-default for functions
    securityLevel: "SECURE_ALWAYS" as const,
  };

  // Create endpoint with the appropriate trigger type
  return createEndpointWithTrigger(baseConfig, properties);
}

/**
 * Creates an endpoint with the appropriate trigger configuration based on extension properties.
 */
function createEndpointWithTrigger(
  baseConfig: any,
  properties: FunctionResourceProperties
): backend.Endpoint {
  // Schedule trigger
  if (properties.properties?.scheduleTrigger) {
    return {
      ...baseConfig,
      scheduleTrigger: {
        schedule: properties.properties.scheduleTrigger.schedule || "",
        timeZone: properties.properties.scheduleTrigger.timeZone || null,
      },
    } as backend.ScheduleTriggered & typeof baseConfig;
  }

  // Task queue trigger
  if (properties.properties?.taskQueueTrigger) {
    return {
      ...baseConfig,
      taskQueueTrigger: {
        rateLimits: properties.properties.taskQueueTrigger.rateLimits || null,
        retryConfig: properties.properties.taskQueueTrigger.retryConfig || null,
        invoker: null, // Will be set by configureEndpointSecurity if needed
      },
    } as backend.TaskQueueTriggered & typeof baseConfig;
  }

  // Default to HTTPS trigger (includes explicit httpsTrigger and fallback)
  return {
    ...baseConfig,
    httpsTrigger: {
      invoker: null, // Will be set by configureEndpointSecurity if needed
    },
  } as backend.HttpsTriggered & typeof baseConfig;
}

/**
 * Adds security and IAM configurations to the endpoint.
 * 
 * @param endpoint The function endpoint to configure
 * @param invokerPrincipals Array of IAM principals allowed to invoke the function
 */
export function configureEndpointSecurity(
  endpoint: backend.Endpoint,
  invokerPrincipals?: string[]
): void {
  // For HTTP/callable functions, configure security
  if (backend.isHttpsTriggered(endpoint)) {
    endpoint.httpsTrigger.invoker = invokerPrincipals || null;
  } else if (backend.isTaskQueueTriggered(endpoint)) {
    endpoint.taskQueueTrigger.invoker = invokerPrincipals || null;
  }
}