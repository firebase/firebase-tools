import * as clc from "cli-color";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

import { Command } from "../command";
import { logger } from "../logger";
import { requirePermissions } from "../requirePermissions";
import * as fenv from "../functions/env";
import * as getProjectId from "../getProjectId";
import * as utils from "../utils";

const DETAILED_DESCRIPTION =
  "This command will set environment variables in project my-project " +
  "based on the current values stored in functions:config and from environment" +
  "variables setup in your deployed firebase functions." +
  "See https://firebase.google.com/docs/functions/config-migration for a detailed" +
  "migration guide to using environment variables in your function.";

export default new Command("functions:env:migrate")
  .description("migrate environment config to environment variables")
  .option("--file <envFile>", "path to file with environment variables in .env format.")
  .before(requirePermissions, [
    "firebase.envstores.create",
    "firebase.envstores.delete",
    "firebase.envstores.update",
  ])
  .action(async (args: string[], options: any) => {
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
    const envs = await fenv.setEnvs(projectId, setEnvs);
    logger.info(fenv.formatEnv(envs));
    return envs;
  });
