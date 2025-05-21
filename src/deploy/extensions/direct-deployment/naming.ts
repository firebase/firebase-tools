/**
 * Utilities for generating consistent function names for extension functions
 */

/**
 * Generate a consistent function ID for an extension function.
 * This ensures we can track and update the functions reliably.
 * 
 * Format: ext-{instanceId}-{functionName}
 * 
 * @param instanceId The extension instance ID
 * @param functionName The name of the function within the extension
 * @returns A globally unique function ID
 */
export function generateExtensionFunctionId(
  instanceId: string,
  functionName: string
): string {
  return `ext-${instanceId}-${functionName}`;
}

/**
 * Check if a function ID belongs to an extension function
 * based on the naming pattern.
 * 
 * @param functionId The function ID to check
 * @returns True if the function ID matches the extension function pattern
 */
export function isExtensionFunctionId(functionId: string): boolean {
  return functionId.startsWith("ext-");
}

/**
 * Extract the extension instance ID from an extension function ID.
 * 
 * @param functionId The extension function ID
 * @returns The extension instance ID or null if the ID doesn't match the pattern
 */
export function extractInstanceIdFromFunctionId(functionId: string): string | null {
  if (!isExtensionFunctionId(functionId)) {
    return null;
  }
  
  // Remove the 'ext-' prefix and split by remaining hyphens
  const parts = functionId.substring(4).split("-");
  
  // The instance ID is everything except the last part (which is the function name)
  if (parts.length < 2) {
    return null;
  }
  
  return parts.slice(0, -1).join("-");
}

/**
 * Extract the extension function name from an extension function ID.
 * 
 * @param functionId The extension function ID
 * @returns The extension function name or null if the ID doesn't match the pattern
 */
export function extractFunctionNameFromFunctionId(functionId: string): string | null {
  if (!isExtensionFunctionId(functionId)) {
    return null;
  }
  
  // Remove the 'ext-' prefix and split by remaining hyphens
  const parts = functionId.substring(4).split("-");
  
  // The function name is the last part
  if (parts.length < 2) {
    return null;
  }
  
  return parts[parts.length - 1];
}