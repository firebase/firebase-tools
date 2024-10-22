import { Command } from "../command";
import { logger } from "../logger";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import { accessSecretVersion } from "../gcp/secretManager";
import { requireAuth } from "../requireAuth";
import * as secretManager from "../gcp/secretManager";
import { requirePermissions } from "../requirePermissions";
import {
  APPHOSTING_LOCAL_YAML,
  allYamlPaths,
  writeReadableConfigToAppHostingYaml,
  yamlPath,
} from "../apphosting/config";
import { getAppHostingConfigToExport } from "../apphosting/secrets";
import { FirebaseError } from "../error";
import { basename, dirname, join } from "path";
import { loadAppHostingYaml } from "../apphosting/utils";
import { AppHostingReadableConfiguration } from "../apphosting/config";

export const command = new Command("apphosting:config:export")
  .description(
    "Export apphosting configurations such as secrets into an apphosting.local.yaml file",
  )
  .option(
    "-s, --secrets <apphosting.yaml or apphosting.<environment>.yaml file to export secrets from>",
    "This command combines the base apphosting.yaml with the specified environment-specific file (e.g., apphosting.staging.yaml). If keys conflict, the environment-specific file takes precedence.",
  )
  .before(requireAuth)
  .before(secretManager.ensureApi)
  .before(requirePermissions, ["secretmanager.versions.access"])
  .action(async (options: Options) => {
    const projectId = needProjectId(options);
    const currentDir = process.cwd();

    // Get all apphosting yaml files ignoring the apphosting.local.yaml file
    const yamlFilePaths = allYamlPaths(currentDir)?.filter(
      (path) => !path.endsWith(APPHOSTING_LOCAL_YAML),
    );

    if (!yamlFilePaths) {
      logger.warn("No apphosting YAMLS found");
      return;
    }

    // Load apphosting.local.yaml file if it exists. Secrets should be added to the env list in this object and written back to the apphosting.local.yaml
    const localAppHostingConfig = await loadLocalAppHostingYaml(currentDir);

    const configsToUse = await getAppHostingConfigToExport(yamlFilePaths);
    const secretsToExport = configsToUse.secrets;
    if (!secretsToExport) {
      logger.warn("No secrets found to export in the choosen apphosting files");
      return;
    }

    const secretsToInjectAsEnvs = await fetchSecrets(projectId, secretsToExport);

    configsToUse.environmentVariables = {
      ...localAppHostingConfig.environmentVariables,
      ...secretsToInjectAsEnvs,
    };
    configsToUse.secrets = {};

    // write this config to apphosting.local.yaml
    writeReadableConfigToAppHostingYaml(configsToUse, join(currentDir, APPHOSTING_LOCAL_YAML));

    logger.log("silly", `Wrote Secrets as environment variables to ${APPHOSTING_LOCAL_YAML}.`);
    logger.info(`Wrote Secrets as environment variables to ${APPHOSTING_LOCAL_YAML}.`);
  });

async function loadLocalAppHostingYaml(cwd: string): Promise<AppHostingReadableConfiguration> {
  let localAppHostingConfig: AppHostingReadableConfiguration = {};
  const apphostingLocalConfigPath = yamlPath(cwd, APPHOSTING_LOCAL_YAML);
  if (apphostingLocalConfigPath) {
    localAppHostingConfig = await loadAppHostingYaml(
      dirname(apphostingLocalConfigPath),
      basename(apphostingLocalConfigPath),
    );
  }

  if (!localAppHostingConfig.environmentVariables) {
    localAppHostingConfig.environmentVariables = {};
  }

  return localAppHostingConfig;
}

async function fetchSecrets(
  projectId: string,
  secretKeySourcePair: Record<string, string>,
): Promise<Record<string, string>> {
  const secretsKeyValuePairs: Record<string, string> = {};

  try {
    for (const secretKey of Object.keys(secretKeySourcePair)) {
      let [name, version] = secretKeySourcePair[secretKey].split("@");
      if (!version) {
        version = "latest";
      }

      const value = await accessSecretVersion(projectId, name, version);
      secretsKeyValuePairs[secretKey] = value;
    }
  } catch (e) {
    throw new FirebaseError(`Error exporting secrets: ${e}`);
  }

  return secretsKeyValuePairs;
}
