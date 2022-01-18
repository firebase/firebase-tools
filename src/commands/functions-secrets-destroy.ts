import { Command } from "../command";
import { logger } from "../logger";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import { destroySecretVersion } from "../gcp/secretManager";
import { promptOnce } from "../prompt";

export default new Command("functions:secrets:destroy <KEY>[@version]")
  .description("Destroy a secret. Defaults to destroying the latest version.")
  .withForce("Destroys a secret without confirmation.")
  .action(async (key: string, options: Options) => {
    const projectId = needProjectId(options);
    let [name, version] = key.split("@");
    if (!version) {
      version = "latest";
    }

    if (!options.force) {
      const confirm = await promptOnce(
        {
          name: "destroy",
          type: "confirm",
          default: true,
          message: `Are you sure you want to destroy ${name}@${version}`,
        },
        options
      );
      if (!confirm) {
        return;
      }
    }

    await destroySecretVersion(projectId, name, version);
    logger.info(`Destroyed secret ${name}@${version}`);
  });
