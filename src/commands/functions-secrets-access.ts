import { Command } from "../command.js";
import { logger } from "../logger.js";
import { Options } from "../options.js";
import { needProjectId } from "../projectUtils.js";
import { accessSecretVersion } from "../gcp/secretManager.js";
import { requireAuth } from "../requireAuth.js";
import * as secretManager from "../gcp/secretManager.js";
import { getSecretNameParts } from "../apphosting/secrets/index.js";

export const command = new Command("functions:secrets:access <KEY>[@version]")
  .description(
    "Access secret value given secret and its version. Defaults to accessing the latest version.",
  )
  .before(requireAuth)
  .before(secretManager.ensureApi)
  .action(async (key: string, options: Options) => {
    const projectId = needProjectId(options);
    const [name, version] = getSecretNameParts(key);

    const value = await accessSecretVersion(projectId, name, version);
    logger.info(value);
  });
