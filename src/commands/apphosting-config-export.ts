import { Command } from "../command";
import { logger } from "../logger";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import { requireAuth } from "../requireAuth";
import * as secretManager from "../gcp/secretManager";
import { requirePermissions } from "../requirePermissions";
import { APPHOSTING_LOCAL_YAML_FILE, discoverBackendRoot } from "../apphosting/config";
import { fetchSecrets, loadConfigToExport } from "../apphosting/secrets";
import { resolve } from "path";
import * as fs from "../fsutils";
import { AppHostingYamlConfig } from "../apphosting/yaml";
import { FirebaseError } from "../error";

export const command = new Command("apphosting:config:export")
  .description(
    "Export App Hosting configurations such as secrets into an apphosting.local.yaml file",
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
    const backendRoot = discoverBackendRoot(cwd);
    if (!backendRoot) {
      throw new FirebaseError(
        "Missing apphosting.yaml: This command requires an apphosting.yaml configuration file. Please run 'firebase init apphosting' and try again.",
      );
    }

    const localAppHostingConfigPath = resolve(backendRoot, APPHOSTING_LOCAL_YAML_FILE);
    if (fs.fileExistsSync(localAppHostingConfigPath)) {
      localAppHostingConfig = await AppHostingYamlConfig.loadFromFile(localAppHostingConfigPath);
    }

    const configToExport = await loadConfigToExport(cwd, environmentConfigFile);
    const secretsToExport = configToExport.secrets;
    if (!secretsToExport) {
      logger.warn("No secrets found to export in the chosen App Hosting config files");
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
    localAppHostingConfig.upsertFile(localAppHostingConfigPath);
    logger.info(`Wrote secrets as environment variables to ${APPHOSTING_LOCAL_YAML_FILE}.`);
  });
