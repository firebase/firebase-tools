import { Command } from "../command";
import { logger } from "../logger";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import { accessSecretVersion } from "../gcp/secretManager";
import { requireAuth } from "../requireAuth";
import * as secretManager from "../gcp/secretManager";
import { requirePermissions } from "../requirePermissions";
import { APPHOSTING_LOCAL_YAML, allYamlPaths, store, yamlPath } from "../apphosting/config";
import { getAppHostingConfigToExport } from "../apphosting/secrets";
import { FirebaseError } from "../error";
import { basename, dirname, join } from "path";
import * as yaml from "yaml";
import * as jsYaml from "js-yaml";
import { readFileFromDirectory, wrappedSafeLoad } from "../utils";
import { Config } from "../apphosting/config";
import fs from "fs";

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
    let yamlFilePaths = allYamlPaths(currentDir)?.filter(
      (path) => !path.endsWith(APPHOSTING_LOCAL_YAML),
    );
    if (!yamlFilePaths) {
      logger.warn("No apphosting YAMLS found");
      return;
    }

    // TODO: Load apphosting.local.yaml file if it exists. Secrets should be added to the env list in this object and written back to the apphosting.local.yaml
    let localAppHostingConfig: Config = {};
    const apphostingLocalConfigPath = yamlPath(currentDir, APPHOSTING_LOCAL_YAML);
    if (apphostingLocalConfigPath) {
      const file = await readFileFromDirectory(
        dirname(apphostingLocalConfigPath),
        basename(apphostingLocalConfigPath),
      );

      localAppHostingConfig = await wrappedSafeLoad(file.source);
    }

    const mergedConfigs = await getAppHostingConfigToExport(yamlFilePaths);
    const secretsToExport = mergedConfigs.secrets;
    if (!secretsToExport) {
      logger.warn("No secrets found to export in the choosen apphosting files");
      return;
    }

    if (!localAppHostingConfig.env) {
      localAppHostingConfig.env = [];
    }

    try {
      for (const secretKey of Object.keys(secretsToExport)) {
        let [name, version] = secretsToExport[secretKey].split("@");
        if (!version) {
          version = "latest";
        }

        const value = await accessSecretVersion(projectId, name, version);
        localAppHostingConfig.env.push({ variable: secretKey, value, availability: ["RUNTIME"] });
      }
    } catch (e) {
      throw new FirebaseError(`Error exporting secrets: ${e}`);
    }

    // write this config to apphosting.local.yaml
    store(
      join(currentDir, APPHOSTING_LOCAL_YAML),
      yaml.parseDocument(jsYaml.dump(localAppHostingConfig)),
    );

    logger.log("silly", `Wrote Secrets as environment variables to ${APPHOSTING_LOCAL_YAML}.`);
    logger.info(`Wrote Secrets as environment variables to ${APPHOSTING_LOCAL_YAML}.`);
  });
