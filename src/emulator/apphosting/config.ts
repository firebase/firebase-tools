import { join } from "path";
import { pathExists } from "fs-extra";
import { logger } from "./utils";
import { Emulators } from "../types";
import { APPHOSTING_BASE_YAML_FILE, APPHOSTING_LOCAL_YAML_FILE } from "../../apphosting/config";
import { AppHostingYamlConfig } from "../../apphosting/yaml";

/**
 * Loads in apphosting.yaml & apphosting.local.yaml, giving
 * apphosting.local.yaml precedence if present.
 */
export async function getLocalAppHostingConfiguration(
  sourceDirectory: string,
): Promise<AppHostingYamlConfig> {
  const config: AppHostingYamlConfig = AppHostingYamlConfig.empty();

  if (await pathExists(join(sourceDirectory, APPHOSTING_BASE_YAML_FILE))) {
    logger.logLabeled(
      "SUCCESS",
      Emulators.APPHOSTING,
      `${APPHOSTING_BASE_YAML_FILE} found, loading configuration`,
    );

    const baseConfig = await AppHostingYamlConfig.loadFromFile(
      join(sourceDirectory, APPHOSTING_BASE_YAML_FILE),
    );
    config.merge(baseConfig);
  }

  if (await pathExists(join(sourceDirectory, APPHOSTING_LOCAL_YAML_FILE))) {
    logger.logLabeled(
      "SUCCESS",
      Emulators.APPHOSTING,
      `${APPHOSTING_LOCAL_YAML_FILE} found, loading configuration`,
    );

    const localConfig = await AppHostingYamlConfig.loadFromFile(
      join(sourceDirectory, APPHOSTING_LOCAL_YAML_FILE),
    );
    config.merge(localConfig);
  }

  return config;
}
