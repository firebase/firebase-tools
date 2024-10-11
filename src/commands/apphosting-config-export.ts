import { Command } from "../command";
import { logger } from "../logger";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import { accessSecretVersion } from "../gcp/secretManager";
import { requireAuth } from "../requireAuth";
import * as secretManager from "../gcp/secretManager";
import { requirePermissions } from "../requirePermissions";
import { allYamlPaths, exportSecrets } from "../apphosting/config";

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
    // let [name, version] = key.split("@");
    // if (!version) {
    //   version = "latest";
    // }
    // const value = await accessSecretVersion(projectId, name, version);
    const currentDir = process.cwd();
    const yamlFilePaths = allYamlPaths(currentDir);
    console.log(`yaml file paths: ${JSON.stringify(yamlFilePaths)}`);
    if (!yamlFilePaths) {
      logger.warn("No apphosting YAMLS found");
      return;
    }

    await exportSecrets(yamlFilePaths);
  });
