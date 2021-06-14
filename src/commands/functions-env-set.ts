import * as clc from "cli-color";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

import { Command } from "../command";
import { ensure as ensureEnvStore } from "../functions/enableEnv";
import { logger } from "../logger";
import { promptOnce } from "../prompt";
import { requirePermissions } from "../requirePermissions";
import * as fenv from "../functions/env";
import * as getProjectId from "../getProjectId";
import * as utils from "../utils";

export default new Command("functions:env:set [values...]")
  .description("set environment variables, completely replacing the existing set")
  .option("--file <envFile>", "path to file with environment variables in .env format.")
  .option("-f, --force", "No confirmation. Otherwise, a confirmation prompt will appear.")
  .before(requirePermissions, [
    "firebase.envstores.create",
    "firebase.envstores.delete",
    "firebase.envstores.update",
  ])
  .before(ensureEnvStore)
  .action(async (args: string[], options: { file?: string; force: boolean }) => {
    if (!options.file && !args.length) {
      return utils.reject("Must supply at least one key/value pair, e.g. " + clc.bold("FOO=bar"));
    }
    let setEnvs: Record<string, string>;
    if (options.file) {
      const buf = fs.readFileSync(path.resolve(options.file), "utf8");
      setEnvs = dotenv.parse(buf.toString().trim());
    } else {
      setEnvs = fenv.parseKvArgs(args);
    }

    const projectId = getProjectId(options);
    const curEnvs = await fenv.getEnvs(projectId);

    if (curEnvs && Object.keys(curEnvs).length) {
      const confirm = await promptOnce(
        {
          type: "confirm",
          name: "force",
          default: false,
          message:
            "You about to replace current set of environment variables:\n" +
            `\n${fenv.formatEnv(curEnvs)}\n\n` +
            "with the following environment variables:\n" +
            `\n${fenv.formatEnv(setEnvs)}\n\n` +
            "Are you sure you want to do this?",
        },
        options
      );
      if (!confirm) {
        return utils.reject("Command aborted.", { exit: 1 });
      }
    }

    const envs = await fenv.setEnvs(projectId, setEnvs);
    logger.info(fenv.formatEnv(envs));
    return envs;
  });
