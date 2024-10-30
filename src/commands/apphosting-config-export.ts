import { Command } from "../command";
import { logger } from "../logger";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import { requireAuth } from "../requireAuth";
import * as secretManager from "../gcp/secretManager";
import { requirePermissions } from "../requirePermissions";
import { APPHOSTING_LOCAL_YAML_FILE, discoverFilePath } from "../apphosting/config";
import { fetchSecrets, loadConfigToExport } from "../apphosting/secrets";
import { join } from "path";
import { AppHostingYamlConfig } from "../apphosting/yaml";

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
    const environmentConfigFile = options.secrets as string | undefined;
    const cwd = process.cwd();

    // Load apphosting.local.yaml file if it exists. Secrets should be added to the env list in this object and written back to the apphosting.local.yaml
    let localAppHostingConfig: AppHostingYamlConfig = AppHostingYamlConfig.empty();
    const localApphostingConfigPath = discoverFilePath(cwd, APPHOSTING_LOCAL_YAML_FILE);
    if (localApphostingConfigPath) {
      localAppHostingConfig = await AppHostingYamlConfig.loadFromFile(localApphostingConfigPath);
    }

    const configToExport = await loadConfigToExport(cwd, environmentConfigFile);
    const secretsToExport = configToExport.secrets;
    if (!secretsToExport) {
      logger.warn("No secrets found to export in the choosen apphosting files");
      return;
    }

    const secretMaterial = await fetchSecrets(projectId, secretsToExport);
    for (const [key, value] of secretMaterial) {
      localAppHostingConfig.addEnvironmentVariable({
        variable: key,
        value: value,
        availability: ["RUNTIME"],
      });
    }

    // update apphosting.local.yaml
    localAppHostingConfig.upsertFile(
      localApphostingConfigPath ?? join(cwd, APPHOSTING_LOCAL_YAML_FILE),
    );

    logger.info(`Wrote secrets as environment variables to ${APPHOSTING_LOCAL_YAML_FILE}.`);
  });
