import { SecretEnvVar } from "../../functions/backend";
import { FirebaseError } from "../../../error";

/**
 * Processes extension parameters for function deployment.
 * This formats parameters according to function requirements and
 * processes secret parameters specially.
 * 
 * @param params Extension instance parameters from .env file
 * @param systemParams System parameters from the extension config
 * @param projectId The Firebase project ID
 * @returns Processed environment variables for function deployment
 */
export function processExtensionParams(
  params: Record<string, string>,
  systemParams: Record<string, string>,
  projectId: string
): Record<string, string> {
  // Start with system parameters
  const processedParams: Record<string, string> = { ...systemParams };
  
  // Add regular params, prefixing if needed
  for (const [key, value] of Object.entries(params)) {
    if (!systemParams[key]) {
      processedParams[key] = value;
    }
  }
  
  return processedParams;
}

/**
 * Process secret parameters from an extension instance for use with Cloud Functions.
 * Secret parameters need special handling as they reference Secret Manager resources.
 * 
 * @param params The extension parameters that may contain secret references
 * @param projectId The Firebase project ID
 * @returns Array of SecretEnvVar objects that can be used with function deployment
 */
export function processSecretParams(
  params: Record<string, string>,
  projectId: string
): SecretEnvVar[] {
  const secretEnvVars: SecretEnvVar[] = [];
  
  // Find parameters that reference secrets 
  // Extension secrets typically have the format "projects/*/secrets/*/versions/*"
  for (const [key, value] of Object.entries(params)) {
    const secretMatch = value.match(/^projects\/([^/]+)\/secrets\/([^/]+)\/versions\/([^/]+)$/);
    
    if (secretMatch) {
      const [, secretProjectId, secretName, version] = secretMatch;
      
      secretEnvVars.push({
        key,
        secret: secretName,
        projectId: secretProjectId,
        version: version === "latest" ? undefined : version
      });
      
      // Remove the secret reference from regular params
      delete params[key];
    }
  }
  
  return secretEnvVars;
}

/**
 * Validates that required parameters are present and have valid values.
 * 
 * @param params The parameters to validate
 * @param requiredParams Array of parameter names that are required
 * @throws FirebaseError if any required parameters are missing
 */
export function validateParams(
  params: Record<string, string>,
  requiredParams: string[]
): void {
  const missingParams = requiredParams.filter(param => !params[param]);
  
  if (missingParams.length > 0) {
    throw new FirebaseError(
      `Missing required parameters for extension: ${missingParams.join(", ")}`,
      { exit: 1 }
    );
  }
}