import { join } from "path";
import { pathExists } from "fs-extra";
import { readFileFromDirectory, wrappedSafeLoad } from "../../utils";
import { logger } from "./utils";
import { Emulators } from "../types";
import { Config as AppHostingYaml, APPHOSTING_BASE_YAML_FILE } from "../../apphosting/config";

const APPHOSTING_LOCAL_YAML = "apphosting.local.yaml";

interface AppHostingConfiguration {
  environmentVariables?: Record<string, string>;
  secrets?: Record<string, string>;
}

/**
 * Reads an apphosting.*.yaml file, parses, and returns in an easy to use
 * format.
 */
export async function loadAppHostingYaml(
  sourceDirectory: string,
  fileName: string,
): Promise<AppHostingConfiguration> {
  const file = await readFileFromDirectory(sourceDirectory, fileName);
  const apphostingYaml: AppHostingYaml = await wrappedSafeLoad(file.source);

  const environmentVariables: Record<string, string> = {};
  const secrets: Record<string, string> = {};

  if (apphostingYaml.env) {
    for (const env of apphostingYaml.env) {
      if (env.value) {
        environmentVariables[env.variable] = env.value;
      }

      if (env.secret) {
        secrets[env.variable] = env.secret;
      }
    }
  }

  return { environmentVariables, secrets };
}

/**
 * Loads in apphosting.yaml & apphosting.local.yaml, giving
 * apphosting.local.yaml precedence if present.
 */
export async function getLocalAppHostingConfiguration(
  sourceDirectory: string,
): Promise<AppHostingConfiguration> {
  let apphostingBaseConfig: AppHostingConfiguration = {};
  let apphostingLocalConfig: AppHostingConfiguration = {};

  if (await pathExists(join(sourceDirectory, APPHOSTING_BASE_YAML_FILE))) {
    logger.logLabeled(
      "SUCCESS",
      Emulators.APPHOSTING,
      `${APPHOSTING_BASE_YAML_FILE} found, loading configuration`,
    );
    apphostingBaseConfig = await loadAppHostingYaml(sourceDirectory, APPHOSTING_BASE_YAML_FILE);
  }

  if (await pathExists(join(sourceDirectory, APPHOSTING_LOCAL_YAML))) {
    logger.logLabeled(
      "SUCCESS",
      Emulators.APPHOSTING,
      `${APPHOSTING_LOCAL_YAML} found, loading configuration`,
    );
    apphostingLocalConfig = await loadAppHostingYaml(sourceDirectory, APPHOSTING_LOCAL_YAML);
  }

  // Combine apphosting configurations in order of lowest precedence to highest
  return {
    environmentVariables: {
      ...apphostingBaseConfig.environmentVariables,
      ...apphostingLocalConfig.environmentVariables,
    },
    secrets: {
      ...apphostingBaseConfig.secrets,
      ...apphostingLocalConfig.secrets,
    },
  };
}
