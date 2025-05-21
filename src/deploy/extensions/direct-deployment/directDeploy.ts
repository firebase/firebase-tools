import { FirebaseError } from "../../../error";
import { Context as ExtContext, Payload as ExtPayload } from "../args";
import { Context as FuncContext, Payload as FuncPayload } from "../../functions/args";
import { getExtensionSpec } from "../planner";
import { convertExtensionToFunctionEndpoints } from "./extensionToFunctions";
import { needProjectId } from "../../../projectUtils";
import { logger } from "../../../logger";
import { DeployOptions } from "../..";
import * as backend from "../../functions/backend";
import * as experiments from "../../../experiments";

/**
 * Checks if the direct deployment feature is enabled for extensions.
 */
export function isDirectDeployEnabled(): boolean {
  return experiments.isEnabled("extdirectdeploy");
}

/**
 * Validates that the extension deployment is compatible with direct deploy.
 * 
 * @param payload The extension deployment payload
 * @throws FirebaseError if incompatible operations are attempted
 */
export function validateForDirectDeploy(payload: ExtPayload): void {
  // Block extension creation for now
  if (payload.instancesToCreate && payload.instancesToCreate.length > 0) {
    throw new FirebaseError(
      "Creating new extensions is not yet supported with direct deployment. " +
      "Please create the extension using the traditional flow first, then updates will use direct deployment.",
      { exit: 1 }
    );
  }
  
  logger.debug("Extension payload validation passed for direct deployment");
}

/**
 * Converts extensions to function endpoints and integrates with function deployment.
 * This is the core of the direct deploy approach - we convert extensions to 
 * function format and let the function deployment machinery handle everything.
 * 
 * @param extContext Extension deployment context
 * @param extPayload Extension deployment payload  
 * @param funcContext Function deployment context (to be populated)
 * @param funcPayload Function deployment payload (to be populated) 
 * @param options Deployment options
 */
export async function directDeployExtensions(
  extContext: ExtContext,
  extPayload: ExtPayload,
  funcContext: FuncContext,
  funcPayload: FuncPayload,
  options: DeployOptions
): Promise<void> {
  if (!isDirectDeployEnabled()) {
    logger.debug("Direct deployment not enabled, skipping extension-to-function conversion");
    return;
  }
  
  validateForDirectDeploy(extPayload);
  
  const projectId = needProjectId(options);
  
  // Collect all instances that need deployment
  const instancesToProcess = [
    ...(extPayload.instancesToUpdate || []),
    ...(extPayload.instancesToConfigure || [])
  ];
  
  if (instancesToProcess.length === 0) {
    logger.debug("No extension instances to process for direct deployment");
    return;
  }
  
  logger.info(`Converting ${instancesToProcess.length} extension instances to function deployment`);
  
  // Initialize function payload if not already present
  if (!funcPayload.functions) {
    funcPayload.functions = {};
  }
  
  // Convert each extension instance to function endpoints
  for (const instance of instancesToProcess) {
    try {
      // Load the extension spec
      const extensionSpec = await getExtensionSpec(instance);
      
      // Convert to function endpoints
      const endpoints = await convertExtensionToFunctionEndpoints(
        projectId,
        instance,
        extensionSpec
      );
      
      if (endpoints.length === 0) {
        logger.debug(`Extension ${instance.instanceId} has no functions, skipping`);
        continue;
      }
      
      // Create a codebase for this extension instance
      const codebaseId = `ext-${instance.instanceId}`;
      const wantBackend = backend.of(...endpoints);
      
      // Add to function payload
      funcPayload.functions[codebaseId] = {
        wantBackend,
        haveBackend: backend.empty() // Will be populated by function deployment process
      };
      
      logger.debug(`Extension ${instance.instanceId} converted to codebase ${codebaseId} with ${endpoints.length} functions`);
      
    } catch (error) {
      throw new FirebaseError(
        `Failed to convert extension ${instance.instanceId} for direct deployment: ${error instanceof Error ? error.message : String(error)}`,
        { exit: 1 }
      );
    }
  }
  
  // Clear extension payload since we're handling via function deployment
  extPayload.instancesToUpdate = [];
  extPayload.instancesToConfigure = [];
  
  // Note: We leave instancesToDelete alone for now - those will still 
  // go through the traditional extension deployment path
  
  logger.info(`Successfully converted extensions to function deployment format`);
}

/**
 * Determines if extension operations should be skipped because they're 
 * being handled by function deployment.
 * 
 * @param payload Extension deployment payload
 * @returns True if extension deployment should be skipped
 */
export function shouldSkipExtensionDeployment(payload: ExtPayload): boolean {
  if (!isDirectDeployEnabled()) {
    return false;
  }
  
  // If we have no instances to create/update/configure, skip extension deployment
  const hasInstancesToProcess = 
    (payload.instancesToCreate && payload.instancesToCreate.length > 0) ||
    (payload.instancesToUpdate && payload.instancesToUpdate.length > 0) ||
    (payload.instancesToConfigure && payload.instancesToConfigure.length > 0);
    
  return !hasInstancesToProcess;
}