import { Command } from "../command";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import { requireAuth } from "../requireAuth";
import * as secretManager from "../gcp/secretManager";
import { requirePermissions } from "../requirePermissions";
import { discoverBackendRoot, exportConfig } from "../apphosting/config";
import { FirebaseError } from "../error";
import { detectProjectRoot } from "../detectProjectRoot";

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

    const backendRoot = discoverBackendRoot(cwd);
    if (!backendRoot) {
      throw new FirebaseError(
        "Missing apphosting.yaml: This command requires an apphosting.yaml configuration file. Please run 'firebase init apphosting' and try again.",
      );
    }

    const projectRoot = detectProjectRoot({}) ?? backendRoot;
    await exportConfig(cwd, projectRoot, backendRoot, projectId, environmentConfigFile);
  });
