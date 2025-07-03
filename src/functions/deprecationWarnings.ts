import { logWarning } from "../utils";

// Placeholder deprecation message - will be updated with approved text from doc team
const FUNCTIONS_CONFIG_DEPRECATION_MESSAGE = 
  "functions:config is deprecated and will be removed on December 31, 2025.\n" +
  "  Please migrate to environment variables.\n" +
  "  Use 'firebase functions:config:export' to migrate your existing config to .env files";

/**
 * Logs a deprecation warning for functions.config() usage
 */
export function logFunctionsConfigDeprecationWarning(): void {
  logWarning(FUNCTIONS_CONFIG_DEPRECATION_MESSAGE);
}