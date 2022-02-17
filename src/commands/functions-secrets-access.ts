import { Command } from "../command";
import { logger } from "../logger";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import { accessSecretVersion } from "../gcp/secretManager";

export default new Command("functions:secrets:access <KEY>[@version]")
  .description(
    "Access secret value given secret and its version. Defaults to accessing the latest version."
  )
  .action(async (key: string, options: Options) => {
    const projectId = needProjectId(options);
    let [name, version] = key.split("@");
    if (!version) {
      version = "latest";
    }
    const value = await accessSecretVersion(projectId, name, version);
    logger.info(value);
  });
