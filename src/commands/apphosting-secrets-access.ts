import { Command } from "../command.js";
import { logger } from "../logger.js";
import { Options } from "../options.js";
import { needProjectId } from "../projectUtils.js";
import { accessSecretVersion } from "../gcp/secretManager.js";
import { requireAuth } from "../requireAuth.js";
import * as secretManager from "../gcp/secretManager.js";
import { requirePermissions } from "../requirePermissions.js";

export const command = new Command("apphosting:secrets:access <secretName[@version]>")
  .description(
    "Access secret value given secret and its version. Defaults to accessing the latest version.",
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
