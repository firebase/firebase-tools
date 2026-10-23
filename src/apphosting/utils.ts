import { FirebaseError } from "../error";
import { APPHOSTING_YAML_FILE_REGEX } from "./config";
import { WebConfig } from "../fetchWebSetup";

/**
 * Returns <environment> given an apphosting.<environment>.yaml file
 */
export function getEnvironmentName(apphostingYamlFileName: string): string {
  const found = apphostingYamlFileName.match(APPHOSTING_YAML_FILE_REGEX);
  if (!found || found.length < 2 || !found[1]) {
    throw new FirebaseError("Invalid apphosting environment file");
  }

  return found[1].replaceAll(".", "");
}

/**
 * Helper to get the JS SDK auto-init environment variables.
 * @param webappConfig - An optional web app config from Firebase.
 * @return A mapping of auto-init environment variables.
 */
export function getAutoinitEnvVars(webappConfig: WebConfig | undefined): Record<string, string> {
  if (!webappConfig) {
    return {};
  }
  return {
    FIREBASE_WEBAPP_CONFIG: JSON.stringify(webappConfig),
    FIREBASE_CONFIG: JSON.stringify({
      databaseURL: webappConfig.databaseURL,
      storageBucket: webappConfig.storageBucket,
      projectId: webappConfig.projectId,
    }),
  };
}
