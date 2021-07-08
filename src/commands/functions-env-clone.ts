import * as clc from "cli-color";

import { Command } from "../command";
import { requirePermissions } from "../requirePermissions";
import * as fenv from "../functions/env";
import * as getProjectId from "../getProjectId";
import * as utils from "../utils";

export default new Command("functions:env:clone")
  .description("clone environment variables from another project")
  .option("--from <projectId>", "the project from which to clone environment variables")
  .option("--only <keys>", "a comma-separated list of keys to clone")
  .option("--except <keys>", "a comma-separated list of keys to not clone")
  .before(requirePermissions, [
    "firebase.envstores.create",
    "firebase.envstores.get",
    "firebase.envstores.list",
    "firebase.envstores.update",
  ])
  .action(async (options: any) => {
    const projectId = getProjectId(options);
    if (!options.from) {
      return utils.reject(
        "Must specify a source project in " + clc.bold("--from <projectId>") + " option."
      );
    } else if (options.from === projectId) {
      return utils.reject("From project and destination can't be the same project.");
    } else if (options.only && options.except) {
      return utils.reject("Cannot use both --only and --except at the same time.");
    }
    let only: string[] = [];
    let except: string[] = [];
    if (options.only) {
      only = options.only.split(",");
    } else if (options.except) {
      except = options.except.split(",");
    }
    const envs = await fenv.clone({
      fromProjectId: options.from,
      toProjectId: projectId,
      only,
      except,
    });
    utils.logSuccess(
      "Cloned functions envrionment variables from " +
        clc.bold(options.from) +
        " into " +
        clc.bold(projectId) +
        "\n"
    );
    utils.logWarning(
      "Please deploy your functions for the change to take effect by running " +
        clc.bold("firebase deploy --only functions") +
        "."
    );
    return envs;
  });
