import { Command } from "../command";
import { logger } from "../logger";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import { accessSecretVersion } from "../gcp/secretManager";
import { requireAuth } from "../requireAuth";
import * as secretManager from "../gcp/secretManager";
import { getSecretNameParts } from "../apphosting/secrets";

export const command = new Command("functions:secrets:access <KEY>[@version]")
  .description(
    "access secret value given secret and its version. Defaults to accessing the latest version",
  )
  .before(requireAuth)
  .before(secretManager.ensureApi)
  .action(async (key: string, options: Options) => {
    const projectId = needProjectId(options);
    const [name, version] = getSecretNameParts(key);

    const value = await accessSecretVersion(projectId, name, version);
    logger.info(value);
  });
