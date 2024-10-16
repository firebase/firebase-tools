import { Command } from "../command";
import { logger } from "../logger";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import { accessSecretVersion } from "../gcp/secretManager";
import { requireAuth } from "../requireAuth";
import * as secretManager from "../gcp/secretManager";
import { requirePermissions } from "../requirePermissions";
import { APPHOSTING_LOCAL_YAML, allYamlPaths, store } from "../apphosting/config";
import { getAppHostingConfigToExport } from "../apphosting/secrets";
import { FirebaseError } from "../error";
import { join } from "path";
import * as yaml from "yaml";

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
    const yamlFilePaths = allYamlPaths(currentDir);

    if (!yamlFilePaths) {
      logger.warn("No apphosting YAMLS found");
      return;
    }

    const config = await getAppHostingConfigToExport(yamlFilePaths);
    const secretsToExport = config.secrets;
    if (!secretsToExport) {
      logger.warn("No secrets found to export in the choosen apphosting files");
      return;
    }

    if (!config.environmentVariables) {
      config.environmentVariables = {};
    }

    try {
      for (const secretKey of Object.keys(secretsToExport)) {
        let [name, version] = secretsToExport[secretKey].split("@");
        if (!version) {
          version = "latest";
        }

        const value = await accessSecretVersion(projectId, name, version);
        config.environmentVariables[name] = value;
      }
    } catch (e) {
      throw new FirebaseError(`Error exporting secrets: ${e}`);
    }

    // write this config to apphosting.local.yaml
    store(join(currentDir, APPHOSTING_LOCAL_YAML), yaml.parseDocument(JSON.stringify(config)));

    logger.log("silly", `Wrote Secrets as environment variables to ${APPHOSTING_LOCAL_YAML}.`);
    logger.info(`Wrote Secrets as environment variables to ${APPHOSTING_LOCAL_YAML}.`);
  });
