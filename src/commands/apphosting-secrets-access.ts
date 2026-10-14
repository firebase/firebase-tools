import { Command } from "../command";
import { logger } from "../logger";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import { accessSecretVersion } from "../gcp/secretManager";
import { requireAuth } from "../requireAuth";
import * as secretManager from "../gcp/secretManager";
import { requirePermissions } from "../requirePermissions";

export const command = new Command("apphosting:secrets:access <secretName[@version]>")
  .description(
    "access secret value given secret and its version. Defaults to accessing the latest version",
  )
  .before(requireAuth)
  .before(secretManager.ensureApi)
  .before(requirePermissions, ["secretmanager.versions.access"])
  .action(async (key: string, options: Options) => {
    const projectId = needProjectId(options);
    let [name, version] = key.split("@");
    if (!version) {
      version = "latest";
    }
    const value = await accessSecretVersion(projectId, name, version);
    logger.info(value);
  });
