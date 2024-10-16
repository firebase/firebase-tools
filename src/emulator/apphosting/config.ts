import { join } from "path";
import { pathExists } from "fs-extra";
import { logger } from "./utils";
import { Emulators } from "../types";
import { APPHOSTING_BASE_YAML_FILE } from "../../apphosting/config";
import { AppHostingConfiguration, loadAppHostingYaml } from "../../apphosting/utils";
import { readFileFromDirectory } from "../../utils";

const APPHOSTING_LOCAL_YAML = "apphosting.local.yaml";

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
