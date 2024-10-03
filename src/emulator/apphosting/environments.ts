import { readFileFromDirectory, wrappedSafeLoad } from "../../utils";
import { pathExists } from "fs-extra";
import { join } from "path";
import { logger } from "./utils";
import { Emulators } from "../types";

export type EnvironmentAvailability = "BUILD" | "RUNTIME";

const APPHOSTING_YAML = "apphosting.yaml";
const APPHOSTING_LOCAL_YAML = "apphosting.local.yaml";

interface AppHostingYaml {
  env?: {
    variable: string;
    secret?: string;
    value?: string;
    availability?: EnvironmentAvailability[];
  }[];
}

interface AppHostingConfiguration {
  environmentVariables?: { [key: string]: string };
  secrets?: { [key: string]: string };
}

/**
 * Exported for unit testing
 */
export async function loadAppHostingYaml(
  sourceDirectory: string,
  fileName: string,
): Promise<AppHostingConfiguration> {
  const file = await readFileFromDirectory(sourceDirectory, fileName);
  const apphostingYaml: AppHostingYaml = await wrappedSafeLoad(file.source);

  const environmentVariables: { [key: string]: string } = {};
  const secrets: { [key: string]: string } = {};

  if (apphostingYaml.env) {
    apphostingYaml.env.map((env) => {
      if (env.value) {
        environmentVariables[env.variable] = env.value;
      }

      if (env.secret) {
        secrets[env.variable] = env.secret;
      }
    });
  }

  return { environmentVariables, secrets };
}

/**
 * Loads in apphosting.yaml & apphosting.local.yaml, giving
 * apphosting.local.yaml precedence if one is present.
 */
export async function getLocalAppHostingConfiguration(
  sourceDirectory: string,
): Promise<AppHostingConfiguration> {
  let apphostingBaseConfig: AppHostingConfiguration = {};
  let apphostingLocalConfig: AppHostingConfiguration = {};

  if (await pathExists(join(sourceDirectory, APPHOSTING_YAML))) {
    logger.logLabeled(
      "SUCCESS",
      Emulators.APPHOSTING,
      `${APPHOSTING_YAML} found, loading configuration`,
    );
    apphostingBaseConfig = await loadAppHostingYaml(sourceDirectory, APPHOSTING_YAML);
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
