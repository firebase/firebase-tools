import * as backend from "../../functions/backend";
import { DeploymentInstanceSpec } from "../planner";
import { ExtensionSpec, FUNCTIONS_RESOURCE_TYPE } from "../../../extensions/types";
import { FirebaseError } from "../../../error";
import { convertExtensionFunctionToEndpoint } from "./functionConfig";
import { processExtensionParams, processSecretParams } from "./paramProcessing";
import { logger } from "../../../logger";

/**
 * Converts extension instances to function endpoints for use with 
 * the function deployment machinery.
 */

/**
 * Converts an extension instance to function endpoints that represent
 * the desired state for function deployment.
 * 
 * @param projectId The Firebase project ID
 * @param instanceSpec The extension instance specification
 * @param extensionSpec The extension specification  
 * @returns Array of endpoints representing desired function state
 */
export async function convertExtensionToFunctionEndpoints(
  projectId: string,
  instanceSpec: DeploymentInstanceSpec,
  extensionSpec: ExtensionSpec
): Promise<backend.Endpoint[]> {
  const endpoints: backend.Endpoint[] = [];
  
  logger.debug(`Converting extension ${instanceSpec.instanceId} to function endpoints`);
  
  // Process parameters for this extension instance
  const processedParams = processExtensionParams(
    instanceSpec.params,
    instanceSpec.systemParams,
    projectId
  );
  
  // Process secret parameters
  const secretParams = processSecretParams(instanceSpec.params, projectId);
  
  // Extract all function resources from the extension spec
  const functionResources = extensionSpec.resources.filter(
    resource => resource.type === FUNCTIONS_RESOURCE_TYPE || resource.type === "firebaseextensions.v1beta.v2function"
  );
  
  if (functionResources.length === 0) {
    logger.debug(`Extension ${instanceSpec.instanceId} has no function resources`);
    return endpoints;
  }
  
  logger.debug(`Extension ${instanceSpec.instanceId} has ${functionResources.length} function resources`);
  
  // Convert each function resource to an endpoint
  for (let i = 0; i < functionResources.length; i++) {
    const resource = functionResources[i];
    // Use index as function ID if name is not available
    const functionId = resource.name || `function${i + 1}`;
    
    try {
      const endpoint = convertExtensionFunctionToEndpoint(
        projectId,
        instanceSpec.instanceId,
        functionId,
        resource as any, // Type assertion needed since we support both v1 and v2 function types
        processedParams
      );
      
      // Add secret environment variables if any
      if (secretParams.length > 0) {
        endpoint.secretEnvironmentVariables = secretParams;
      }
      
      // Add labels to identify this as an extension function
      endpoint.labels = {
        ...endpoint.labels,
        'firebase-ext-instance-id': instanceSpec.instanceId,
        'deployment-tool': 'firebase-extensions'
      };
      
      // Mark this endpoint as originating from an extension
      // This will help the function deployment process handle it appropriately
      endpoint.codebase = `ext-${instanceSpec.instanceId}`;
      
      endpoints.push(endpoint);
      
    } catch (error) {
      throw new FirebaseError(
        `Failed to convert extension function ${functionId} in ${instanceSpec.instanceId}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  
  logger.debug(`Converted extension ${instanceSpec.instanceId} to ${endpoints.length} function endpoints`);
  return endpoints;
}

/**
 * Creates a backend configuration from extension instances.
 * This creates the structure needed by the function deployment system.
 * 
 * @param projectId The Firebase project ID
 * @param instances Array of extension instances to convert
 * @param extensionSpecs Map of instance ID to extension spec
 * @returns Backend configuration for function deployment
 */
export async function createBackendFromExtensions(
  projectId: string,
  instances: DeploymentInstanceSpec[],
  extensionSpecs: Record<string, ExtensionSpec>
): Promise<backend.Backend> {
  const backendConfig = backend.empty();
  
  for (const instance of instances) {
    const extensionSpec = extensionSpecs[instance.instanceId];
    if (!extensionSpec) {
      throw new FirebaseError(`Extension spec not found for instance ${instance.instanceId}`);
    }
    
    const endpoints = await convertExtensionToFunctionEndpoints(
      projectId,
      instance,
      extensionSpec
    );
    
    // Add endpoints to the backend configuration
    for (const endpoint of endpoints) {
      if (!backendConfig.endpoints[endpoint.region]) {
        backendConfig.endpoints[endpoint.region] = {};
      }
      backendConfig.endpoints[endpoint.region][endpoint.id] = endpoint;
    }
  }
  
  // Add required APIs for extensions
  backendConfig.requiredAPIs.push({
    api: "firebaseextensions.googleapis.com",
    reason: "Required for extension functions"
  });
  
  return backendConfig;
}