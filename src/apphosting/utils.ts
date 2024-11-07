import { FirebaseError } from "../error";
import { APPHOSTING_BASE_YAML_FILE, APPHOSTING_YAML_FILE_REGEX } from "./config";
import * as prompt from "../prompt";

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
 * Prompts user for an App Hosting yaml file
 *
 * Given a map of App Hosting yaml file names and their paths
 * (e.g: "apphosting.staging.yaml" => "/cwd/apphosting.staging.yaml"), this function
 * will prompt the user to choose an App Hosting configuration. It returns the path
 * of the chosen App Hosting configuration.
 */
export async function promptForAppHostingYaml(
  apphostingFileNameToPathMap: Map<string, string>,
  promptMessage = "Please select an App Hosting config:",
): Promise<string> {
  const fileNames = Array.from(apphostingFileNameToPathMap.keys());

  const baseFilePath = apphostingFileNameToPathMap.get(APPHOSTING_BASE_YAML_FILE);
  const listOptions = fileNames.map((fileName) => {
    if (fileName === APPHOSTING_BASE_YAML_FILE) {
      return {
        name: `base (${APPHOSTING_BASE_YAML_FILE})`,
        value: baseFilePath,
      };
    }

    const environment = getEnvironmentName(fileName);
    return {
      name: baseFilePath
        ? `${environment} (${APPHOSTING_BASE_YAML_FILE} + ${fileName})`
        : `${environment} (${fileName})`,
      value: apphostingFileNameToPathMap.get(fileName)!,
    };
  });

  const fileToExportPath = await prompt.promptOnce({
    name: "apphosting-yaml",
    type: "list",
    message: promptMessage,
    choices: listOptions,
  });

  return fileToExportPath;
}
