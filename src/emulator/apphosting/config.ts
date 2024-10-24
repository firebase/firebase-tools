import { join } from "path";
import { pathExists } from "fs-extra";
import { logger } from "./utils";
import { Emulators } from "../types";
import { APPHOSTING_BASE_YAML_FILE } from "../../apphosting/config";
import { AppHostingYamlConfig, loadAppHostingYaml } from "../../apphosting/yaml";

const APPHOSTING_LOCAL_YAML = "apphosting.local.yaml";

/**
 * Loads in apphosting.yaml & apphosting.local.yaml, giving
 * apphosting.local.yaml precedence if present.
 */
export async function getLocalAppHostingConfiguration(
  sourceDirectory: string,
): Promise<AppHostingYamlConfig> {
  let mainConfig: AppHostingYamlConfig | undefined;

  if (await pathExists(join(sourceDirectory, APPHOSTING_BASE_YAML_FILE))) {
    logger.logLabeled(
      "SUCCESS",
      Emulators.APPHOSTING,
      `${APPHOSTING_BASE_YAML_FILE} found, loading configuration`,
    );

    mainConfig = await loadAppHostingYaml(join(sourceDirectory, APPHOSTING_BASE_YAML_FILE));
    console.log(`${JSON.stringify(mainConfig._loadedAppHostingYaml)}`);
    console.log(`main config: ${JSON.stringify(mainConfig.environmentVariables)}`);
  }

  if (await pathExists(join(sourceDirectory, APPHOSTING_LOCAL_YAML))) {
    logger.logLabeled(
      "SUCCESS",
      Emulators.APPHOSTING,
      `${APPHOSTING_LOCAL_YAML} found, loading configuration`,
    );

    const localConfig = await loadAppHostingYaml(join(sourceDirectory, APPHOSTING_LOCAL_YAML));
    console.log(`local config: ${JSON.stringify(localConfig.environmentVariables)}`);
    if (mainConfig) {
      mainConfig.merge(localConfig);
    }
  }

  // Combine apphosting configurations in order of lowest precedence to highest
  if (!mainConfig) {
    return await loadAppHostingYaml();
  }

  return mainConfig;
}
