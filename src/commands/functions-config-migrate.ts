import * as clc from "cli-color";

import { Command } from "../command";
import { FirebaseError } from "../error";
import { logger } from "../logger";
import { promptOnce } from "../prompt";
import { requirePermissions } from "../requirePermissions";
import * as env from "../functions/env";
import * as functionsConfig from "../functionsConfig";
import * as getProjectId from "../getProjectId";
import * as utils from "../utils";

export default new Command("functions:config:migrate")
  .description("migrate environment config to environment variables")
  .before(requirePermissions, [
    "firebase.envstores.create",
    "firebase.envstores.get",
    "firebase.envstores.list",
    "firebase.envstores.update",
    "runtimeconfig.configs.list",
    "runtimeconfig.configs.get",
    "runtimeconfig.variables.list",
    "runtimeconfig.variables.get",
  ])
  .action(async (options: any) => {
    const projectId = getProjectId(options);

    logger.info(
      "This command will add environment variables in project " +
        `${projectId} based on the current values stored in functions:config. ` +
        "See https://firebase.google.com/docs/functions/env#migration for a " +
        "detailed migration guide to using environment variables in your function.\n"
    );

    const configs = await functionsConfig.materializeAll(projectId);

    if (Object.keys(configs).length == 0) {
      throw new FirebaseError("Found nothing in functions:config.");
    }

    const converts = env.convertConfig(configs);

    if (converts.success.length > 0) {
      logger.info(
        "Based on your current config, the following environment variables will be added:\n"
      );
      logger.info(
        converts.success
          .map(
            (conv) =>
              `${clc.bold(conv.envKey)}=${JSON.stringify(conv.value)} (from ${clc.italic(
                conv.configKey
              )})`
          )
          .join("\n") + "\n"
      );
    }

    if (converts.errors.length > 0) {
      logger.warn(`${clc.red.bold("WARNING")}: Following configs can't be migrated:`);
      logger.warn(
        converts.errors
          .map((err) => `${clc.italic(err.configKey)} => ${clc.bold(err.envKey)} (${err.errMsg})`)
          .join("\n") + "\n"
      );
    }

    if (converts.success.length < 0) {
      return;
    }

    const confirm = await promptOnce(
      {
        type: "confirm",
        name: "force",
        default: false,
        message: "Would you like to add these env variables?",
      },
      options
    );
    if (!confirm) {
      throw new FirebaseError("Command aborted!");
    }

    const envs: Record<string, string> = converts.success.reduce(
      (acc: Record<string, string>, next) => {
        acc[next.envKey] = next.value;
        return acc;
      },
      {}
    );
    utils.logBullet("Adding env variables...");
    await env.addEnvs(projectId, envs);
    utils.logSuccess("Successfully added env variables!\n");
    logger.info(
      "Newly deployed functions will now be able to access these via process.env.VARIABLE_NAME."
    );
  });
