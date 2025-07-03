import { logWarning } from "../utils";

const FUNCTIONS_CONFIG_DEPRECATION_MESSAGE =
  "DEPRECATION NOTICE: Action required to deploy after Dec 31, 2025\n" +
  "  functions.config() API is deprecated.\n" +
  "  Cloud Runtime Configuration API, the Google Cloud service used to store function configuration data, will be shut down on December 31, 2025. As a result, you must migrate away from using functions.config() to continue deploying your functions after December 31, 2025.\n" +
  "  What this means for you:\n" +
  "  The Firebase CLI commands for managing this configuration (functions:config:set, get, unset, clone, and export) are deprecated. These commands no longer work after December 31, 2025.\n" +
  "  firebase deploy command will fail for functions that use the legacy functions.config() API after December 31, 2025.\n" +
  "  Existing deployments will continue to work with their current configuration.\n" +
  "  See your migration options at: https://firebase.google.com/docs/functions/config-env#migrate-to-dotenv";

/**
 * Logs a deprecation warning for functions.config() usage
 */
export function logFunctionsConfigDeprecationWarning(): void {
  logWarning(FUNCTIONS_CONFIG_DEPRECATION_MESSAGE);
}
