import { Command } from "../command";
import { logger } from "../logger";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import { requireAuth } from "../requireAuth";
import * as secretManager from "../gcp/secretManager";
import { requirePermissions } from "../requirePermissions";
import { APPHOSTING_LOCAL_YAML_FILE, allYamlPaths, yamlPath } from "../apphosting/config";
import { fetchSecrets, getConfigToExport } from "../apphosting/secrets";
import { join } from "path";
import { loadAppHostingYaml } from "../apphosting/yaml";

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
      (path) => !path.endsWith(APPHOSTING_LOCAL_YAML_FILE),
    );

    if (!yamlFilePaths) {
      logger.warn("No apphosting YAMLS found");
      return;
    }

    // Load apphosting.local.yaml file if it exists. Secrets should be added to the env list in this object and written back to the apphosting.local.yaml
    const apphostingLocalConfigPath = yamlPath(currentDir, APPHOSTING_LOCAL_YAML_FILE);
    const localAppHostingConfig = await loadAppHostingYaml(apphostingLocalConfigPath ?? undefined);

    const configsToExport = await getConfigToExport(yamlFilePaths);
    const secretsToExport = configsToExport.secrets;
    if (!secretsToExport) {
      logger.warn("No secrets found to export in the choosen apphosting files");
      return;
    }

    const secretsToInjectAsEnvs = await fetchSecrets(projectId, secretsToExport);
    for (const [key, value] of secretsToInjectAsEnvs) {
      localAppHostingConfig.addEnvironmentVariable({
        variable: key,
        value: value,
        availability: ["RUNTIME"],
      });
    }

    // update apphosting.local.yaml
    localAppHostingConfig.writeToFile(
      apphostingLocalConfigPath ?? join(currentDir, APPHOSTING_LOCAL_YAML_FILE),
    );

    logger.info(`Wrote Secrets as environment variables to ${APPHOSTING_LOCAL_YAML_FILE}.`);
  });
