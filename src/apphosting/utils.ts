import { FirebaseError, getErrMsg } from "../error";
import { APPHOSTING_BASE_YAML_FILE, APPHOSTING_YAML_FILE_REGEX } from "./config";
import { WebConfig } from "../fetchWebSetup";
import * as prompt from "../prompt";
import * as fs from "fs-extra";
import * as path from "path";
import { logger } from "../logger";

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
        value: baseFilePath!,
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

  const fileToExportPath = await prompt.select<string>({
    message: promptMessage,
    choices: listOptions,
  });

  return fileToExportPath;
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

/**
 * Reads and parses the package.json file in the specified directory.
 */
export async function parsePackageJson(packageJsonPath: string): Promise<PackageJson | undefined> {
  if (!(await fs.pathExists(packageJsonPath))) {
    return undefined;
  }
  try {
    const content = await fs.readFile(packageJsonPath, "utf-8");
    return JSON.parse(content) as PackageJson;
  } catch (err: unknown) {
    logger.debug(`Failed to read or parse package.json at ${packageJsonPath}: ${getErrMsg(err)}`);
    return undefined;
  }
}

export interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export enum Framework {
  NEXTJS = "nextjs",
  ANGULAR = "angular",
}

/**
 * Detects the framework based on package.json dependencies.
 * Returns Framework.NEXTJS or Framework.ANGULAR if detected, otherwise undefined.
 */
export async function detectFramework(appDir: string): Promise<Framework | undefined> {
  const packageJsonPath = path.join(appDir, "package.json");
  const pkg = await parsePackageJson(packageJsonPath);
  if (!pkg) {
    return undefined;
  }

  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  if (deps["next"]) {
    return Framework.NEXTJS;
  }
  if (deps["@angular/core"]) {
    return Framework.ANGULAR;
  }

  return undefined;
}
